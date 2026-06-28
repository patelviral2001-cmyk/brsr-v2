"""Declarative validation rules engine.

Each :class:`ValidationRule` is a pure function from
``(field, ValidationContext) -> RuleResult``. The engine evaluates every
applicable rule across a batch of extracted fields, attaches the failures
to ``field.validation_issues``, and returns a flat issue list that the
orchestrator forwards to the HITL review queue.

Design goals:
  * **Declarative** — rules are data; new ones drop into ``DEFAULT_RULES``
    without touching the engine.
  * **Composable** — physical, logical, period, statistical, unit,
    document-type and India-specific rules all share the same signature.
  * **Fast** — the engine evaluates the full pack in well under 100 ms
    per typical document (≤ 50 fields) because each rule is a handful of
    arithmetic/regex operations and is short-circuited by ``applies_to``.
  * **Observable** — every rule outcome is logged via structlog with
    rule_name, severity, passed and field key.

Severity → confidence weight mapping (see ``severity_weight`` on
:class:`RuleResult` and :func:`severity_weight_for`):

  ERROR → 0.6   (one error halves cross_validation; two errors zero it)
  WARN  → 0.2
  INFO  → 0.05
"""
from __future__ import annotations

import math
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Iterable, Optional

from app.models.responses import ExtractedField, ValidationIssue
from app.registry import get_metric
from app.utils.logging import get_logger
from app.validation.context import ValidationContext

logger = get_logger("validation.rules_engine")


# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


class Severity(str, Enum):
    """Three-level severity matching the backend's HITL queue buckets."""

    ERROR = "error"
    WARN = "warning"
    INFO = "info"


def severity_weight_for(sev: Severity) -> float:
    """Default 0..1 weight used in confidence scoring."""
    return {Severity.ERROR: 0.6, Severity.WARN: 0.2, Severity.INFO: 0.05}.get(sev, 0.2)


@dataclass
class RuleResult:
    """Outcome of evaluating one rule against one field."""

    rule_name: str
    severity: Severity
    passed: bool
    message: str
    affected_fields: list[str] = field(default_factory=list)
    suggested_fix: Optional[str] = None
    severity_weight: float = 0.0

    def to_validation_issue(self, canonical_key: str) -> ValidationIssue:
        return ValidationIssue(
            canonical_key=canonical_key,
            severity=self.severity.value,
            code=self.rule_name,
            message=self.message,
            suggested_value=None,
            detail={
                "affected_fields": list(self.affected_fields),
                "suggested_fix": self.suggested_fix,
                "severity_weight": self.severity_weight,
            },
        )


CheckFn = Callable[[ExtractedField, ValidationContext], "RuleResult"]


@dataclass
class ValidationRule:
    """Declarative rule definition. Pure-data + a callable ``check``."""

    name: str
    severity: Severity
    applies_to: list[str]  # canonical_keys this rule applies to OR ["*"]
    check: CheckFn
    message_template: str = ""
    description: str = ""

    def applicable(self, key: str) -> bool:
        return "*" in self.applies_to or key in self.applies_to


# ---------------------------------------------------------------------------
# Convenience: build a "pass" result
# ---------------------------------------------------------------------------


def _pass(name: str, sev: Severity) -> RuleResult:
    return RuleResult(rule_name=name, severity=sev, passed=True, message="", severity_weight=0.0)


def _fail(
    name: str,
    sev: Severity,
    message: str,
    affected: Iterable[str] = (),
    suggested_fix: Optional[str] = None,
) -> RuleResult:
    return RuleResult(
        rule_name=name,
        severity=sev,
        passed=False,
        message=message,
        affected_fields=list(affected),
        suggested_fix=suggested_fix,
        severity_weight=severity_weight_for(sev),
    )


# ---------------------------------------------------------------------------
# Canonical key buckets — used by several rules
# ---------------------------------------------------------------------------


_CONSUMPTION_KEYS = {
    "electricity_kwh",
    "electricity_from_renewable_kwh",
    "electricity_from_grid_kwh",
    "diesel_l",
    "petrol_l",
    "lpg_kg",
    "lng_kg",
    "png_scm",
    "coal_tonnes",
    "biomass_tonnes",
    "fuel_oil_l",
    "steam_purchased_gj",
    "heat_purchased_gj",
    "water_withdrawn_total_kl",
    "water_consumed_kl",
    "water_discharged_kl",
    "water_recycled_kl",
    "waste_hazardous_kg",
    "waste_non_hazardous_kg",
    "waste_recycled_kg",
    "waste_to_landfill_kg",
    "waste_to_incineration_kg",
    "waste_to_coprocessing_kg",
    "e_waste_kg",
    "plastic_waste_kg",
    "biomedical_waste_kg",
    "battery_waste_kg",
    "construction_demolition_waste_kg",
    "scope1_emissions_tco2e",
    "scope2_emissions_location_tco2e",
    "scope2_emissions_market_tco2e",
    "training_hours_total",
    "training_hours_health_safety",
    "training_hours_skill_upgrade",
    "training_hours_human_rights",
    "nox_kg",
    "sox_kg",
    "pm_kg",
    "voc_kg",
    "csr_spend_inr",
    "turnover_inr",
    "capex_inr",
    "opex_inr",
    "fines_paid_inr",
}

_COUNT_KEYS = {
    "employee_count_total",
    "employee_count_male",
    "employee_count_female",
    "employee_count_lgbtq",
    "employee_count_pwd",
    "employee_count_permanent",
    "contract_workers_count",
    "trainees_count",
    "workers_male_count",
    "workers_female_count",
    "board_size",
    "independent_directors_count",
    "women_directors_count",
    "board_meetings_count",
    "fatality_count",
    "near_miss_count",
    "occupational_disease_cases",
    "safety_audits_count",
    "csr_beneficiaries_count",
    "whistleblower_cases_count",
    "anticorruption_incidents_count",
    "directors_with_independence_certification",
}

_PERCENT_KEYS = {
    "women_in_management_pct",
    "women_on_board_pct",
    "attrition_rate_pct",
    "training_coverage_pct",
    "local_procurement_pct",
    "anticorruption_training_pct",
    "gender_pay_gap_pct",
}

# Add complaints_received/resolved/pending_* — generated keys.
_GRIEVANCE_GROUPS = ["employees", "consumers", "workers", "community", "shareholders", "value_chain"]
for _g in _GRIEVANCE_GROUPS:
    _COUNT_KEYS.add(f"complaints_received_{_g}")
    _COUNT_KEYS.add(f"complaints_resolved_{_g}")
    _COUNT_KEYS.add(f"complaints_pending_{_g}")


# Map doc_type -> a list of canonical_keys you "expect" to see when extracting.
_DOC_TYPE_EXPECTED_KEYS = {
    "UTILITY_BILL": {"electricity_kwh", "electricity_from_grid_kwh"},
    "ELECTRICITY_BILL": {"electricity_kwh", "electricity_from_grid_kwh"},
    "FUEL_INVOICE": {"diesel_l", "petrol_l", "lpg_kg"},
    "DIESEL_INVOICE": {"diesel_l"},
    "HR_PAYROLL": {
        "employee_count_total",
        "employee_count_male",
        "employee_count_female",
        "employee_count_permanent",
        "contract_workers_count",
    },
    "WATER_BILL": {"water_withdrawn_total_kl", "water_withdrawn_third_party_kl"},
    "WASTE_MANIFEST": {"waste_hazardous_kg", "waste_non_hazardous_kg"},
}


# ---------------------------------------------------------------------------
# Per-field rule helpers
# ---------------------------------------------------------------------------


def _val(f: ExtractedField) -> Optional[float]:
    """Return the numeric value to validate, preferring canonical."""
    if f.value_canonical is not None:
        return f.value_canonical
    return f.value_num


def _same_period_field(ctx: ValidationContext, key: str) -> Optional[ExtractedField]:
    """Return a sibling field for the same period (lookup helper)."""
    return ctx.field_by_key.get(key)


# ---------------------------------------------------------------------------
# Physical constraints
# ---------------------------------------------------------------------------


def _rule_non_negative(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "PHY_NON_NEGATIVE"
    v = _val(f)
    if v is None:
        return _pass(name, Severity.ERROR)
    if v < 0:
        return _fail(
            name,
            Severity.ERROR,
            f"{f.canonical_key} cannot be negative (got {v:g}).",
            affected=[f.canonical_key],
            suggested_fix="Re-check the extraction — sign may be inverted.",
        )
    return _pass(name, Severity.ERROR)


def _rule_count_integer(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "PHY_COUNT_INTEGER"
    v = _val(f)
    if v is None:
        return _pass(name, Severity.WARN)
    # Tolerate values that round to an integer (e.g. 12.0).
    if abs(v - round(v)) > 1e-6:
        return _fail(
            name,
            Severity.WARN,
            f"{f.canonical_key} must be a whole number (got {v}).",
            affected=[f.canonical_key],
            suggested_fix=f"Round to {int(round(v))}.",
        )
    return _pass(name, Severity.WARN)


def _rule_percent_range(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "PHY_PERCENT_RANGE"
    v = _val(f)
    if v is None:
        return _pass(name, Severity.ERROR)
    # gender_pay_gap_pct is signed; everything else is 0..100.
    if f.canonical_key == "gender_pay_gap_pct":
        if v < -100 or v > 100:
            return _fail(
                name,
                Severity.ERROR,
                f"{f.canonical_key} must be between -100 and 100 (got {v:g}).",
                affected=[f.canonical_key],
            )
    elif v < 0 or v > 100:
        suggested = None
        if 100 < v <= 10000:
            suggested = f"Did you extract a basis-points / per-mille value? Try {v/100:.2f}%."
        return _fail(
            name,
            Severity.ERROR,
            f"{f.canonical_key} must be a percentage 0..100 (got {v:g}).",
            affected=[f.canonical_key],
            suggested_fix=suggested,
        )
    return _pass(name, Severity.ERROR)


# ---------------------------------------------------------------------------
# Logical cross-field constraints
# ---------------------------------------------------------------------------


def _rule_gender_sum_le_total(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "LOG_GENDER_SUM_LE_TOTAL"
    total_f = _same_period_field(ctx, "employee_count_total")
    male_f = _same_period_field(ctx, "employee_count_male")
    female_f = _same_period_field(ctx, "employee_count_female")
    if not (total_f and male_f and female_f):
        return _pass(name, Severity.ERROR)
    total = _val(total_f)
    male = _val(male_f)
    female = _val(female_f)
    if None in (total, male, female):
        return _pass(name, Severity.ERROR)
    if male + female > total + 0.5:  # rounding tolerance
        return _fail(
            name,
            Severity.ERROR,
            f"Male ({male:g}) + Female ({female:g}) = {male + female:g} > total ({total:g}).",
            affected=["employee_count_male", "employee_count_female", "employee_count_total"],
            suggested_fix="Verify total or split — one of the three is mis-extracted.",
        )
    return _pass(name, Severity.ERROR)


def _rule_lgbtq_pwd_sum_le_total(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "LOG_LGBTQ_PWD_SUM_LE_TOTAL"
    total_f = _same_period_field(ctx, "employee_count_total")
    lgbtq_f = _same_period_field(ctx, "employee_count_lgbtq")
    pwd_f = _same_period_field(ctx, "employee_count_pwd")
    if not total_f:
        return _pass(name, Severity.WARN)
    total = _val(total_f)
    lgbtq = _val(lgbtq_f) if lgbtq_f else 0.0
    pwd = _val(pwd_f) if pwd_f else 0.0
    if total is None:
        return _pass(name, Severity.WARN)
    if (lgbtq or 0) + (pwd or 0) > total + 0.5:
        return _fail(
            name,
            Severity.WARN,
            f"LGBTQ+ ({lgbtq:g}) + PwD ({pwd:g}) exceeds total employees ({total:g}).",
            affected=["employee_count_lgbtq", "employee_count_pwd", "employee_count_total"],
        )
    return _pass(name, Severity.WARN)


def _rule_complaints_resolved_le_received(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "LOG_COMPLAINTS_RESOLVED_LE_RECEIVED"
    if not f.canonical_key.startswith("complaints_resolved_"):
        return _pass(name, Severity.ERROR)
    group = f.canonical_key.removeprefix("complaints_resolved_")
    received = _same_period_field(ctx, f"complaints_received_{group}")
    if received is None or _val(received) is None:
        return _pass(name, Severity.ERROR)
    resolved = _val(f)
    if resolved is None:
        return _pass(name, Severity.ERROR)
    if resolved > _val(received) + 0.5:
        return _fail(
            name,
            Severity.ERROR,
            f"Resolved ({resolved:g}) > received ({_val(received):g}) for {group}.",
            affected=[f.canonical_key, f"complaints_received_{group}"],
            suggested_fix="A complaint cannot be 'resolved' if it wasn't 'received'.",
        )
    return _pass(name, Severity.ERROR)


def _rule_women_management_pct_consistency(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    """women_in_management_pct shouldn't grossly exceed female workforce share."""
    name = "LOG_WOMEN_MGMT_VS_WORKFORCE"
    if f.canonical_key != "women_in_management_pct":
        return _pass(name, Severity.WARN)
    total = _same_period_field(ctx, "employee_count_total")
    female = _same_period_field(ctx, "employee_count_female")
    if not (total and female):
        return _pass(name, Severity.WARN)
    t = _val(total)
    fe = _val(female)
    v = _val(f)
    if not t or fe is None or v is None or t <= 0:
        return _pass(name, Severity.WARN)
    workforce_share = (fe / t) * 100.0
    # Mgmt should not exceed workforce share by more than 25 pp (large gap is plausible
    # in firms where women are concentrated in leadership, but uncommon).
    if v > workforce_share + 25.0:
        return _fail(
            name,
            Severity.WARN,
            f"women_in_management_pct ({v:g}%) exceeds female workforce share "
            f"({workforce_share:.1f}%) by more than 25 pp.",
            affected=["women_in_management_pct", "employee_count_female", "employee_count_total"],
        )
    return _pass(name, Severity.WARN)


def _rule_renewable_le_total_electricity(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "LOG_RENEWABLE_LE_TOTAL_ELEC"
    if f.canonical_key != "electricity_from_renewable_kwh":
        return _pass(name, Severity.ERROR)
    total = _same_period_field(ctx, "electricity_kwh")
    if not total or _val(total) is None:
        return _pass(name, Severity.ERROR)
    v = _val(f)
    if v is None:
        return _pass(name, Severity.ERROR)
    if v > _val(total) * 1.001:  # 0.1 % rounding tolerance
        return _fail(
            name,
            Severity.ERROR,
            f"Renewable electricity ({v:g} kWh) exceeds total electricity "
            f"({_val(total):g} kWh).",
            affected=["electricity_from_renewable_kwh", "electricity_kwh"],
            suggested_fix="A subset cannot exceed the parent total.",
        )
    return _pass(name, Severity.ERROR)


def _rule_grid_plus_renewable_eq_total(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    """grid + renewable should ≈ total electricity (when all three extracted)."""
    name = "LOG_GRID_RENEW_SUM_EQ_TOTAL"
    if f.canonical_key != "electricity_kwh":
        return _pass(name, Severity.WARN)
    grid = _same_period_field(ctx, "electricity_from_grid_kwh")
    renew = _same_period_field(ctx, "electricity_from_renewable_kwh")
    if not (grid and renew):
        return _pass(name, Severity.WARN)
    g = _val(grid)
    r = _val(renew)
    tot = _val(f)
    if g is None or r is None or tot is None or tot <= 0:
        return _pass(name, Severity.WARN)
    summed = g + r
    rel_err = abs(summed - tot) / tot
    if rel_err > 0.05:  # >5 % discrepancy
        return _fail(
            name,
            Severity.WARN,
            f"Grid ({g:g}) + Renewable ({r:g}) = {summed:g} differs from total "
            f"({tot:g}) by {rel_err*100:.1f}%.",
            affected=["electricity_kwh", "electricity_from_grid_kwh", "electricity_from_renewable_kwh"],
        )
    return _pass(name, Severity.WARN)


def _rule_water_consumed_le_withdrawn(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "LOG_WATER_CONSUMED_LE_WITHDRAWN"
    if f.canonical_key != "water_consumed_kl":
        return _pass(name, Severity.ERROR)
    wd = _same_period_field(ctx, "water_withdrawn_total_kl")
    if not wd or _val(wd) is None or _val(f) is None:
        return _pass(name, Severity.ERROR)
    if _val(f) > _val(wd) * 1.001:
        return _fail(
            name,
            Severity.ERROR,
            f"water_consumed_kl ({_val(f):g}) > water_withdrawn_total_kl ({_val(wd):g}).",
            affected=["water_consumed_kl", "water_withdrawn_total_kl"],
            suggested_fix="Consumed = withdrawn − discharged; can never exceed withdrawn.",
        )
    return _pass(name, Severity.ERROR)


def _rule_water_recycled_le_consumed_plus_discharged(
    f: ExtractedField, ctx: ValidationContext
) -> RuleResult:
    name = "LOG_WATER_RECYCLED_LE_BASIS"
    if f.canonical_key != "water_recycled_kl":
        return _pass(name, Severity.WARN)
    consumed = _same_period_field(ctx, "water_consumed_kl")
    discharged = _same_period_field(ctx, "water_discharged_kl")
    if not (consumed and discharged):
        return _pass(name, Severity.WARN)
    c = _val(consumed)
    d = _val(discharged)
    r = _val(f)
    if None in (c, d, r):
        return _pass(name, Severity.WARN)
    basis = c + d
    if r > basis * 1.001:
        return _fail(
            name,
            Severity.WARN,
            f"water_recycled_kl ({r:g}) > water_consumed ({c:g}) + water_discharged ({d:g}).",
            affected=["water_recycled_kl", "water_consumed_kl", "water_discharged_kl"],
        )
    return _pass(name, Severity.WARN)


def _rule_waste_recycled_le_total(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "LOG_WASTE_RECYCLED_LE_TOTAL"
    if f.canonical_key != "waste_recycled_kg":
        return _pass(name, Severity.ERROR)
    haz = _same_period_field(ctx, "waste_hazardous_kg")
    non = _same_period_field(ctx, "waste_non_hazardous_kg")
    if not (haz or non):
        return _pass(name, Severity.ERROR)
    h = _val(haz) if haz else 0.0
    n = _val(non) if non else 0.0
    r = _val(f)
    if r is None:
        return _pass(name, Severity.ERROR)
    basis = (h or 0) + (n or 0)
    if basis <= 0:
        return _pass(name, Severity.ERROR)
    if r > basis * 1.001:
        return _fail(
            name,
            Severity.ERROR,
            f"waste_recycled_kg ({r:g}) > hazardous ({h or 0:g}) + non-hazardous ({n or 0:g}).",
            affected=["waste_recycled_kg", "waste_hazardous_kg", "waste_non_hazardous_kg"],
        )
    return _pass(name, Severity.ERROR)


def _rule_scope2_market_le_location_plus_buffer(
    f: ExtractedField, ctx: ValidationContext
) -> RuleResult:
    """Scope 2 market ≤ location + 20 % unless significant RECs/PPAs in play."""
    name = "LOG_SCOPE2_MARKET_LE_LOCATION"
    if f.canonical_key != "scope2_emissions_market_tco2e":
        return _pass(name, Severity.WARN)
    loc = _same_period_field(ctx, "scope2_emissions_location_tco2e")
    if not loc or _val(loc) is None or _val(f) is None:
        return _pass(name, Severity.WARN)
    m = _val(f)
    l = _val(loc)
    if m > l * 1.2:
        return _fail(
            name,
            Severity.WARN,
            f"Scope 2 market ({m:g}) exceeds location ({l:g}) by >20%. "
            "Verify market-based factor / RECs.",
            affected=["scope2_emissions_market_tco2e", "scope2_emissions_location_tco2e"],
        )
    return _pass(name, Severity.WARN)


def _rule_women_directors_le_board(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "LOG_WOMEN_DIRECTORS_LE_BOARD"
    if f.canonical_key != "women_directors_count":
        return _pass(name, Severity.ERROR)
    board = _same_period_field(ctx, "board_size")
    if not board or _val(board) is None or _val(f) is None:
        return _pass(name, Severity.ERROR)
    if _val(f) > _val(board) + 0.5:
        return _fail(
            name,
            Severity.ERROR,
            f"women_directors_count ({_val(f):g}) > board_size ({_val(board):g}).",
            affected=["women_directors_count", "board_size"],
        )
    return _pass(name, Severity.ERROR)


def _rule_independent_directors_le_board(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "LOG_INDEPENDENT_DIRECTORS_LE_BOARD"
    if f.canonical_key != "independent_directors_count":
        return _pass(name, Severity.ERROR)
    board = _same_period_field(ctx, "board_size")
    if not board or _val(board) is None or _val(f) is None:
        return _pass(name, Severity.ERROR)
    if _val(f) > _val(board) + 0.5:
        return _fail(
            name,
            Severity.ERROR,
            f"independent_directors_count ({_val(f):g}) > board_size ({_val(board):g}).",
            affected=["independent_directors_count", "board_size"],
        )
    return _pass(name, Severity.ERROR)


def _rule_independence_certs_le_independent(
    f: ExtractedField, ctx: ValidationContext
) -> RuleResult:
    name = "LOG_INDEP_CERTS_LE_INDEPENDENT"
    if f.canonical_key != "directors_with_independence_certification":
        return _pass(name, Severity.WARN)
    indep = _same_period_field(ctx, "independent_directors_count")
    if not indep or _val(indep) is None or _val(f) is None:
        return _pass(name, Severity.WARN)
    if _val(f) > _val(indep) + 0.5:
        return _fail(
            name,
            Severity.WARN,
            f"Independence certifications ({_val(f):g}) > independent directors "
            f"({_val(indep):g}).",
            affected=["directors_with_independence_certification", "independent_directors_count"],
        )
    return _pass(name, Severity.WARN)


# ---------------------------------------------------------------------------
# Period sanity
# ---------------------------------------------------------------------------


def _rule_period_end_after_start(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "PER_END_AFTER_START"
    if not (f.period_start and f.period_end):
        return _pass(name, Severity.ERROR)
    if f.period_end <= f.period_start:
        return _fail(
            name,
            Severity.ERROR,
            f"period_end ({f.period_end}) is not after period_start ({f.period_start}).",
            affected=[f.canonical_key],
            suggested_fix="Likely period_start / period_end swap.",
        )
    return _pass(name, Severity.ERROR)


def _rule_period_span_le_12mo(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "PER_SPAN_LE_12MO"
    if not (f.period_start and f.period_end):
        return _pass(name, Severity.WARN)
    days = (f.period_end - f.period_start).days
    if days > 380:  # ~12 months + small grace
        return _fail(
            name,
            Severity.WARN,
            f"Reporting period spans {days} days — exceeds 12 months. "
            "Multi-year totals are usually mis-extracted.",
            affected=[f.canonical_key],
        )
    return _pass(name, Severity.WARN)


def _rule_period_in_current_or_prior_fy(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "PER_IN_CURRENT_OR_PRIOR_FY"
    if not f.period_end:
        return _pass(name, Severity.WARN)
    today = ctx.today
    # India FY: April 1 — March 31. Current FY end is the next 31 March.
    current_fy_end_year = today.year if today.month >= 4 else today.year
    # Acceptable: within last 24 months back from today + 1-month future buffer.
    lo_year = today.year - 2
    hi_year = today.year + 1
    if f.period_end.year < lo_year or f.period_end.year > hi_year:
        return _fail(
            name,
            Severity.WARN,
            f"period_end ({f.period_end}) outside current or prior FY window "
            f"[{lo_year}..{hi_year}].",
            affected=[f.canonical_key],
        )
    return _pass(name, Severity.WARN)


# ---------------------------------------------------------------------------
# Period-over-period z-score
# ---------------------------------------------------------------------------


def _rule_pop_zscore(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "STAT_POP_ZSCORE"
    v = _val(f)
    prior = ctx.priors_by_key.get(f.canonical_key, [])
    if v is None or len(prior) < 3:
        return _pass(name, Severity.WARN)
    n = len(prior)
    mu = sum(prior) / n
    var = sum((x - mu) ** 2 for x in prior) / (n - 1)
    sd = math.sqrt(var)
    if sd < 1e-9:
        # No variance — only flag if drastically different.
        if abs(v - mu) > max(1.0, 0.5 * abs(mu)):
            return _fail(
                name,
                Severity.WARN,
                f"Value {v:g} differs from 3-period mean {mu:g} (zero variance prior).",
                affected=[f.canonical_key],
            )
        return _pass(name, Severity.WARN)
    z = (v - mu) / sd
    if abs(z) > 3:
        return _fail(
            name,
            Severity.WARN,
            f"Value differs by {abs(z):.1f} std devs from 3-period mean ({mu:g}).",
            affected=[f.canonical_key],
            suggested_fix=f"Confirm with source — prior periods ranged "
            f"{min(prior):g}..{max(prior):g}.",
        )
    return _pass(name, Severity.WARN)


# ---------------------------------------------------------------------------
# Unit sanity
# ---------------------------------------------------------------------------


def _rule_electricity_unit_sanity(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    """If unit says kWh but value is huge (>5e7), it's almost certainly MWh."""
    name = "UNIT_ELECTRICITY_SUSPECT_MWH"
    if f.canonical_key not in {
        "electricity_kwh",
        "electricity_from_renewable_kwh",
        "electricity_from_grid_kwh",
    }:
        return _pass(name, Severity.WARN)
    unit = (f.unit_extracted or f.unit_canonical or "").lower()
    v = _val(f)
    if v is None:
        return _pass(name, Severity.WARN)
    if "kwh" in unit and v > 5e7:
        return _fail(
            name,
            Severity.WARN,
            f"{v:g} kWh is unusually large — likely MWh extracted as kWh.",
            affected=[f.canonical_key],
            suggested_fix=f"Did you mean kWh? Values >5e7 are likely MWh — "
            f"consider {v/1000:g} MWh.",
        )
    return _pass(name, Severity.WARN)


def _rule_diesel_unit_sanity(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    """diesel typically in litres; tonnes here usually means a unit mis-extraction."""
    name = "UNIT_DIESEL_SUSPECT_TONNES"
    if f.canonical_key != "diesel_l":
        return _pass(name, Severity.WARN)
    unit = (f.unit_extracted or "").lower()
    if "tonne" in unit or "mt" == unit or unit == "t":
        return _fail(
            name,
            Severity.WARN,
            f"Diesel reported in {unit}; canonical unit is litres. "
            "Convert (≈ 1180 L / tonne) or verify.",
            affected=[f.canonical_key],
            suggested_fix="Convert tonnes to litres using density 0.85 kg/L.",
        )
    return _pass(name, Severity.WARN)


# ---------------------------------------------------------------------------
# Document-type sanity
# ---------------------------------------------------------------------------


def _doc_expected_keys_missing(ctx: ValidationContext) -> Optional[set[str]]:
    if not ctx.doc_type:
        return None
    expected = _DOC_TYPE_EXPECTED_KEYS.get(ctx.doc_type.upper())
    if not expected:
        return None
    extracted_keys = set(ctx.field_by_key.keys())
    return expected - extracted_keys


def _rule_doctype_utility_bill(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    """Fires once per evaluation (on the first field) if doc_type expects electricity."""
    name = "DOC_UTILITY_BILL_MISSING_ELEC"
    if not ctx.doc_type or ctx.doc_type.upper() not in {"UTILITY_BILL", "ELECTRICITY_BILL"}:
        return _pass(name, Severity.WARN)
    if "electricity_kwh" in ctx.field_by_key:
        return _pass(name, Severity.WARN)
    return _fail(
        name,
        Severity.WARN,
        f"Document classified as {ctx.doc_type} but no electricity_kwh extracted.",
        affected=["electricity_kwh"],
        suggested_fix="Re-run extraction with stronger utility-bill prompt.",
    )


def _rule_doctype_hr_payroll(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "DOC_HR_PAYROLL_MISSING_HC"
    if not ctx.doc_type or ctx.doc_type.upper() != "HR_PAYROLL":
        return _pass(name, Severity.WARN)
    has_hc = any(k.startswith("employee_count_") for k in ctx.field_by_key)
    if has_hc:
        return _pass(name, Severity.WARN)
    return _fail(
        name,
        Severity.WARN,
        "Document classified as HR_PAYROLL but no employee_count_* extracted.",
        affected=["employee_count_total"],
    )


def _rule_doctype_fuel_invoice(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "DOC_FUEL_INVOICE_MISSING_FUEL"
    if not ctx.doc_type or ctx.doc_type.upper() not in {"FUEL_INVOICE", "DIESEL_INVOICE"}:
        return _pass(name, Severity.WARN)
    has_fuel = any(k in ctx.field_by_key for k in ("diesel_l", "petrol_l", "lpg_kg", "fuel_oil_l"))
    if has_fuel:
        return _pass(name, Severity.WARN)
    return _fail(
        name,
        Severity.WARN,
        f"Document classified as {ctx.doc_type} but no diesel/petrol/fuel_oil extracted.",
        affected=["diesel_l", "petrol_l"],
    )


# ---------------------------------------------------------------------------
# India-specific
# ---------------------------------------------------------------------------


def _rule_electricity_tariff_sanity(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    """₹/kWh should fall in 5..15 for typical industrial Indian tariffs."""
    name = "IND_TARIFF_SANITY"
    if f.canonical_key != "electricity_kwh":
        return _pass(name, Severity.INFO)
    cost_inr = ctx.aux_numbers.get("electricity_cost_inr")
    kwh = _val(f)
    if not cost_inr or not kwh or kwh <= 0:
        return _pass(name, Severity.INFO)
    tariff = cost_inr / kwh
    if tariff < 3.0 or tariff > 25.0:
        return _fail(
            name,
            Severity.INFO,
            f"Implied tariff ₹{tariff:.2f}/kWh outside typical industrial range "
            "(₹5..15/kWh).",
            affected=["electricity_kwh"],
            suggested_fix="Check cost & kWh units (lakh / crore confusion?).",
        )
    return _pass(name, Severity.INFO)


_CIN_RE = re.compile(r"^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$")
_PAN_RE = re.compile(r"^[A-Z]{5}\d{4}[A-Z]$")


def _rule_cin_format(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "IND_CIN_FORMAT"
    if f.canonical_key != "cin":
        return _pass(name, Severity.ERROR)
    val = (f.value_text or "").strip().upper()
    if not val:
        return _pass(name, Severity.ERROR)
    if len(val) != 21 or not _CIN_RE.match(val):
        return _fail(
            name,
            Severity.ERROR,
            f"CIN '{val}' is not 21 chars / does not match L|U-prefix format.",
            affected=["cin"],
            suggested_fix="Format: [L|U] + 5 digits + 2 letters + 4 digits + 3 letters + 6 digits.",
        )
    return _pass(name, Severity.ERROR)


def _rule_pan_format(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "IND_PAN_FORMAT"
    if f.canonical_key != "pan":
        return _pass(name, Severity.ERROR)
    val = (f.value_text or "").strip().upper()
    if not val:
        return _pass(name, Severity.ERROR)
    if not _PAN_RE.match(val):
        return _fail(
            name,
            Severity.ERROR,
            f"PAN '{val}' must match AAAAA9999A.",
            affected=["pan"],
        )
    return _pass(name, Severity.ERROR)


# ---------------------------------------------------------------------------
# Registry value_constraints fallback (catches anything else out-of-range)
# ---------------------------------------------------------------------------


def _rule_registry_min_max(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    name = "REG_VALUE_CONSTRAINTS"
    metric = get_metric(f.canonical_key)
    if not metric:
        return _pass(name, Severity.WARN)
    c = metric.get("value_constraints") or {}
    v = _val(f)
    if v is None:
        return _pass(name, Severity.WARN)
    lo = c.get("min")
    hi = c.get("max")
    if lo is not None and v < lo - 1e-9:
        return _fail(
            name,
            Severity.WARN,
            f"{f.canonical_key} = {v:g} below registry min ({lo}).",
            affected=[f.canonical_key],
        )
    if hi is not None and v > hi + 1e-9:
        return _fail(
            name,
            Severity.WARN,
            f"{f.canonical_key} = {v:g} above registry max ({hi}).",
            affected=[f.canonical_key],
        )
    return _pass(name, Severity.WARN)


# ---------------------------------------------------------------------------
# Health & safety logical
# ---------------------------------------------------------------------------


def _rule_fatalities_le_total_workforce(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    """Fatalities cannot exceed total workforce (sanity)."""
    name = "LOG_FATALITIES_LE_WORKFORCE"
    if f.canonical_key != "fatality_count":
        return _pass(name, Severity.ERROR)
    total = _same_period_field(ctx, "employee_count_total")
    if not total or _val(total) is None or _val(f) is None:
        return _pass(name, Severity.ERROR)
    if _val(f) > _val(total):
        return _fail(
            name,
            Severity.ERROR,
            f"fatality_count ({_val(f):g}) > total workforce ({_val(total):g}).",
            affected=["fatality_count", "employee_count_total"],
        )
    return _pass(name, Severity.ERROR)


def _rule_safety_training_le_total_training(
    f: ExtractedField, ctx: ValidationContext
) -> RuleResult:
    name = "LOG_SAFETY_TRAINING_LE_TOTAL"
    if f.canonical_key != "training_hours_health_safety":
        return _pass(name, Severity.WARN)
    tot = _same_period_field(ctx, "training_hours_total")
    if not tot or _val(tot) is None or _val(f) is None:
        return _pass(name, Severity.WARN)
    if _val(f) > _val(tot) * 1.001:
        return _fail(
            name,
            Severity.WARN,
            f"training_hours_health_safety ({_val(f):g}) > training_hours_total "
            f"({_val(tot):g}).",
            affected=["training_hours_health_safety", "training_hours_total"],
        )
    return _pass(name, Severity.WARN)


def _rule_humanrights_training_le_total(
    f: ExtractedField, ctx: ValidationContext
) -> RuleResult:
    name = "LOG_HR_TRAINING_LE_TOTAL"
    if f.canonical_key != "training_hours_human_rights":
        return _pass(name, Severity.WARN)
    tot = _same_period_field(ctx, "training_hours_total")
    if not tot or _val(tot) is None or _val(f) is None:
        return _pass(name, Severity.WARN)
    if _val(f) > _val(tot) * 1.001:
        return _fail(
            name,
            Severity.WARN,
            f"training_hours_human_rights ({_val(f):g}) > total ({_val(tot):g}).",
            affected=["training_hours_human_rights", "training_hours_total"],
        )
    return _pass(name, Severity.WARN)


def _rule_capex_le_turnover(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    """capex_inr greater than 5 × turnover_inr is a strong red flag."""
    name = "LOG_CAPEX_VS_TURNOVER"
    if f.canonical_key != "capex_inr":
        return _pass(name, Severity.INFO)
    rev = _same_period_field(ctx, "turnover_inr")
    if not rev or _val(rev) is None or _val(f) is None or _val(rev) <= 0:
        return _pass(name, Severity.INFO)
    if _val(f) > _val(rev) * 5.0:
        return _fail(
            name,
            Severity.INFO,
            f"capex_inr ({_val(f):g}) > 5 × turnover_inr ({_val(rev):g}). "
            "Sanity-check units (lakh vs crore).",
            affected=["capex_inr", "turnover_inr"],
        )
    return _pass(name, Severity.INFO)


def _rule_csr_spend_vs_pat(f: ExtractedField, ctx: ValidationContext) -> RuleResult:
    """Indian CSR mandate: 2% of average PAT; spending more than 25% of PAT is suspicious."""
    name = "IND_CSR_SPEND_VS_PAT"
    if f.canonical_key != "csr_spend_inr":
        return _pass(name, Severity.INFO)
    pat = _same_period_field(ctx, "profit_after_tax_inr")
    if not pat or _val(pat) is None or _val(f) is None or _val(pat) <= 0:
        return _pass(name, Severity.INFO)
    ratio = _val(f) / _val(pat)
    if ratio > 0.25:
        return _fail(
            name,
            Severity.INFO,
            f"CSR spend is {ratio*100:.1f}% of PAT — mandate is ~2%. "
            "Check INR-lakh vs INR-crore mismatch.",
            affected=["csr_spend_inr", "profit_after_tax_inr"],
        )
    return _pass(name, Severity.INFO)


def _rule_independent_plus_women_le_board(
    f: ExtractedField, ctx: ValidationContext
) -> RuleResult:
    """Independent + women directors should not exceed board size by much."""
    name = "LOG_INDEP_PLUS_WOMEN_LE_BOARD"
    if f.canonical_key != "board_size":
        return _pass(name, Severity.INFO)
    indep = _same_period_field(ctx, "independent_directors_count")
    women = _same_period_field(ctx, "women_directors_count")
    bs = _val(f)
    i = _val(indep) if indep else 0.0
    w = _val(women) if women else 0.0
    if bs is None:
        return _pass(name, Severity.INFO)
    # Each director can satisfy multiple categories — only flag if both alone exceed board.
    if (i or 0) > bs + 0.5 or (w or 0) > bs + 0.5:
        return _fail(
            name,
            Severity.INFO,
            f"A subset (independent={i or 0:g}, women={w or 0:g}) exceeds board_size ({bs:g}).",
            affected=["board_size", "independent_directors_count", "women_directors_count"],
        )
    return _pass(name, Severity.INFO)


# ---------------------------------------------------------------------------
# Rule registry
# ---------------------------------------------------------------------------


def _wildcard_apply(keys: set[str]) -> list[str]:
    """Return a sorted list — keeps `applies_to` deterministic for tests."""
    return sorted(keys)


DEFAULT_RULES: list[ValidationRule] = [
    # ---- Physical ----
    ValidationRule(
        name="PHY_NON_NEGATIVE",
        severity=Severity.ERROR,
        applies_to=_wildcard_apply(_CONSUMPTION_KEYS | _COUNT_KEYS | _PERCENT_KEYS),
        check=_rule_non_negative,
        message_template="{key} cannot be negative.",
        description="Consumption/quantity/percentage metrics must be ≥ 0.",
    ),
    ValidationRule(
        name="PHY_COUNT_INTEGER",
        severity=Severity.WARN,
        applies_to=_wildcard_apply(_COUNT_KEYS),
        check=_rule_count_integer,
        message_template="{key} must be a whole number.",
        description="Counts are integer-valued.",
    ),
    ValidationRule(
        name="PHY_PERCENT_RANGE",
        severity=Severity.ERROR,
        applies_to=_wildcard_apply(_PERCENT_KEYS),
        check=_rule_percent_range,
        message_template="{key} must be 0..100 (or -100..100 for pay-gap).",
        description="Percentages constrained to [0,100].",
    ),
    # ---- Logical cross-field ----
    ValidationRule(
        name="LOG_GENDER_SUM_LE_TOTAL",
        severity=Severity.ERROR,
        applies_to=["employee_count_male", "employee_count_female", "employee_count_total"],
        check=_rule_gender_sum_le_total,
        message_template="male + female employees ≤ total.",
    ),
    ValidationRule(
        name="LOG_LGBTQ_PWD_SUM_LE_TOTAL",
        severity=Severity.WARN,
        applies_to=["employee_count_lgbtq", "employee_count_pwd", "employee_count_total"],
        check=_rule_lgbtq_pwd_sum_le_total,
        message_template="lgbtq + pwd ≤ total employees.",
    ),
    ValidationRule(
        name="LOG_COMPLAINTS_RESOLVED_LE_RECEIVED",
        severity=Severity.ERROR,
        applies_to=[f"complaints_resolved_{g}" for g in _GRIEVANCE_GROUPS],
        check=_rule_complaints_resolved_le_received,
        message_template="complaints_resolved ≤ complaints_received.",
    ),
    ValidationRule(
        name="LOG_WOMEN_MGMT_VS_WORKFORCE",
        severity=Severity.WARN,
        applies_to=["women_in_management_pct"],
        check=_rule_women_management_pct_consistency,
    ),
    ValidationRule(
        name="LOG_RENEWABLE_LE_TOTAL_ELEC",
        severity=Severity.ERROR,
        applies_to=["electricity_from_renewable_kwh"],
        check=_rule_renewable_le_total_electricity,
    ),
    ValidationRule(
        name="LOG_GRID_RENEW_SUM_EQ_TOTAL",
        severity=Severity.WARN,
        applies_to=["electricity_kwh"],
        check=_rule_grid_plus_renewable_eq_total,
    ),
    ValidationRule(
        name="LOG_WATER_CONSUMED_LE_WITHDRAWN",
        severity=Severity.ERROR,
        applies_to=["water_consumed_kl"],
        check=_rule_water_consumed_le_withdrawn,
    ),
    ValidationRule(
        name="LOG_WATER_RECYCLED_LE_BASIS",
        severity=Severity.WARN,
        applies_to=["water_recycled_kl"],
        check=_rule_water_recycled_le_consumed_plus_discharged,
    ),
    ValidationRule(
        name="LOG_WASTE_RECYCLED_LE_TOTAL",
        severity=Severity.ERROR,
        applies_to=["waste_recycled_kg"],
        check=_rule_waste_recycled_le_total,
    ),
    ValidationRule(
        name="LOG_SCOPE2_MARKET_LE_LOCATION",
        severity=Severity.WARN,
        applies_to=["scope2_emissions_market_tco2e"],
        check=_rule_scope2_market_le_location_plus_buffer,
    ),
    ValidationRule(
        name="LOG_WOMEN_DIRECTORS_LE_BOARD",
        severity=Severity.ERROR,
        applies_to=["women_directors_count"],
        check=_rule_women_directors_le_board,
    ),
    ValidationRule(
        name="LOG_INDEPENDENT_DIRECTORS_LE_BOARD",
        severity=Severity.ERROR,
        applies_to=["independent_directors_count"],
        check=_rule_independent_directors_le_board,
    ),
    ValidationRule(
        name="LOG_INDEP_CERTS_LE_INDEPENDENT",
        severity=Severity.WARN,
        applies_to=["directors_with_independence_certification"],
        check=_rule_independence_certs_le_independent,
    ),
    ValidationRule(
        name="LOG_FATALITIES_LE_WORKFORCE",
        severity=Severity.ERROR,
        applies_to=["fatality_count"],
        check=_rule_fatalities_le_total_workforce,
    ),
    ValidationRule(
        name="LOG_SAFETY_TRAINING_LE_TOTAL",
        severity=Severity.WARN,
        applies_to=["training_hours_health_safety"],
        check=_rule_safety_training_le_total_training,
    ),
    ValidationRule(
        name="LOG_HR_TRAINING_LE_TOTAL",
        severity=Severity.WARN,
        applies_to=["training_hours_human_rights"],
        check=_rule_humanrights_training_le_total,
    ),
    ValidationRule(
        name="LOG_CAPEX_VS_TURNOVER",
        severity=Severity.INFO,
        applies_to=["capex_inr"],
        check=_rule_capex_le_turnover,
    ),
    ValidationRule(
        name="LOG_INDEP_PLUS_WOMEN_LE_BOARD",
        severity=Severity.INFO,
        applies_to=["board_size"],
        check=_rule_independent_plus_women_le_board,
    ),
    # ---- Period sanity ----
    ValidationRule(
        name="PER_END_AFTER_START",
        severity=Severity.ERROR,
        applies_to=["*"],
        check=_rule_period_end_after_start,
    ),
    ValidationRule(
        name="PER_SPAN_LE_12MO",
        severity=Severity.WARN,
        applies_to=["*"],
        check=_rule_period_span_le_12mo,
    ),
    ValidationRule(
        name="PER_IN_CURRENT_OR_PRIOR_FY",
        severity=Severity.WARN,
        applies_to=["*"],
        check=_rule_period_in_current_or_prior_fy,
    ),
    # ---- Period-over-period statistical ----
    ValidationRule(
        name="STAT_POP_ZSCORE",
        severity=Severity.WARN,
        applies_to=["*"],
        check=_rule_pop_zscore,
    ),
    # ---- Unit sanity ----
    ValidationRule(
        name="UNIT_ELECTRICITY_SUSPECT_MWH",
        severity=Severity.WARN,
        applies_to=[
            "electricity_kwh",
            "electricity_from_renewable_kwh",
            "electricity_from_grid_kwh",
        ],
        check=_rule_electricity_unit_sanity,
    ),
    ValidationRule(
        name="UNIT_DIESEL_SUSPECT_TONNES",
        severity=Severity.WARN,
        applies_to=["diesel_l"],
        check=_rule_diesel_unit_sanity,
    ),
    # ---- Document-type sanity ----
    ValidationRule(
        name="DOC_UTILITY_BILL_MISSING_ELEC",
        severity=Severity.WARN,
        applies_to=["*"],
        check=_rule_doctype_utility_bill,
    ),
    ValidationRule(
        name="DOC_HR_PAYROLL_MISSING_HC",
        severity=Severity.WARN,
        applies_to=["*"],
        check=_rule_doctype_hr_payroll,
    ),
    ValidationRule(
        name="DOC_FUEL_INVOICE_MISSING_FUEL",
        severity=Severity.WARN,
        applies_to=["*"],
        check=_rule_doctype_fuel_invoice,
    ),
    # ---- India-specific ----
    ValidationRule(
        name="IND_TARIFF_SANITY",
        severity=Severity.INFO,
        applies_to=["electricity_kwh"],
        check=_rule_electricity_tariff_sanity,
    ),
    ValidationRule(
        name="IND_CIN_FORMAT",
        severity=Severity.ERROR,
        applies_to=["cin"],
        check=_rule_cin_format,
    ),
    ValidationRule(
        name="IND_PAN_FORMAT",
        severity=Severity.ERROR,
        applies_to=["pan"],
        check=_rule_pan_format,
    ),
    ValidationRule(
        name="IND_CSR_SPEND_VS_PAT",
        severity=Severity.INFO,
        applies_to=["csr_spend_inr"],
        check=_rule_csr_spend_vs_pat,
    ),
    # ---- Registry fallback ----
    ValidationRule(
        name="REG_VALUE_CONSTRAINTS",
        severity=Severity.WARN,
        applies_to=["*"],
        check=_rule_registry_min_max,
    ),
]


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


_DOC_LEVEL_RULES = {
    "DOC_UTILITY_BILL_MISSING_ELEC",
    "DOC_HR_PAYROLL_MISSING_HC",
    "DOC_FUEL_INVOICE_MISSING_FUEL",
}


@dataclass
class EngineResult:
    """Output of :meth:`RuleEngine.evaluate_all`."""

    revised_fields: list[ExtractedField]
    issues: list[ValidationIssue]
    rule_outcomes: list[RuleResult]
    latency_ms: int


class RuleEngine:
    """Evaluate a rule pack over a batch of extracted fields."""

    def __init__(self, rules: Optional[list[ValidationRule]] = None) -> None:
        self.rules = rules if rules is not None else DEFAULT_RULES
        # Index rules by applicable key for O(1) lookup.
        self._by_key: dict[str, list[ValidationRule]] = {}
        self._wildcard: list[ValidationRule] = []
        for r in self.rules:
            if "*" in r.applies_to:
                self._wildcard.append(r)
            else:
                for k in r.applies_to:
                    self._by_key.setdefault(k, []).append(r)

    def evaluate_field(
        self,
        field_obj: ExtractedField,
        ctx: ValidationContext,
        *,
        seen_doc_rules: Optional[set[str]] = None,
    ) -> list[RuleResult]:
        """Run every applicable rule against one field."""
        seen_doc_rules = seen_doc_rules if seen_doc_rules is not None else set()
        out: list[RuleResult] = []
        applicable = list(self._by_key.get(field_obj.canonical_key, [])) + self._wildcard
        for rule in applicable:
            # Doc-level rules only need to fire once per document.
            if rule.name in _DOC_LEVEL_RULES:
                if rule.name in seen_doc_rules:
                    continue
                seen_doc_rules.add(rule.name)
            try:
                res = rule.check(field_obj, ctx)
            except Exception as exc:  # noqa: BLE001 — never let a buggy rule crash the pipeline
                logger.warning(
                    "validation.rule_crashed",
                    rule=rule.name,
                    key=field_obj.canonical_key,
                    err=str(exc),
                )
                continue
            logger.debug(
                "validation.rule_outcome",
                rule=rule.name,
                key=field_obj.canonical_key,
                passed=res.passed,
                severity=res.severity.value,
            )
            out.append(res)
        return out

    def evaluate_all(
        self,
        fields: list[ExtractedField],
        ctx: ValidationContext,
    ) -> EngineResult:
        t0 = time.perf_counter()
        revised: list[ExtractedField] = []
        all_issues: list[ValidationIssue] = []
        all_outcomes: list[RuleResult] = []
        seen_doc_rules: set[str] = set()
        for f in fields:
            new_f = f.model_copy(deep=True)
            outcomes = self.evaluate_field(new_f, ctx, seen_doc_rules=seen_doc_rules)
            for res in outcomes:
                all_outcomes.append(res)
                if not res.passed:
                    issue = res.to_validation_issue(new_f.canonical_key)
                    new_f.validation_issues.append(issue)
                    all_issues.append(issue)
                    # Any failing ERROR or WARN forces HITL review.
                    if res.severity in (Severity.ERROR, Severity.WARN):
                        new_f.needs_review = True
            revised.append(new_f)
        latency_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "validation.engine.evaluated",
            fields=len(fields),
            issues=len(all_issues),
            latency_ms=latency_ms,
            errors=sum(1 for i in all_issues if i.severity == Severity.ERROR.value),
            warnings=sum(1 for i in all_issues if i.severity == Severity.WARN.value),
        )
        return EngineResult(
            revised_fields=revised,
            issues=all_issues,
            rule_outcomes=all_outcomes,
            latency_ms=latency_ms,
        )

    # ------------------------------------------------------------------
    # Confidence integration
    # ------------------------------------------------------------------
    @staticmethod
    def validation_score(field_obj: ExtractedField) -> float:
        """Return validation_score component in [0,1] for the confidence scorer.

        * 1.0 if no ERROR rules failed
        * 0.5 if 1 ERROR
        * 0.0 if ≥2 ERRORs

        WARN rules do not directly fail the score (they are still surfaced).
        """
        errors = sum(
            1 for i in field_obj.validation_issues if i.severity == Severity.ERROR.value
        )
        if errors == 0:
            return 1.0
        if errors == 1:
            return 0.5
        return 0.0
