"""Universal Energy Schema — one schema for every energy document, forever.

Design rules (from the UEDI mission):
  * No DISCOM-specific fields. Aliases are resolved upstream by the dictionary.
  * Extensible WITHOUT schema changes: `energy_flow` and `charges` are typed
    *lists* keyed by a canonical code, so a new charge type or a new energy flow
    (BESS, virtual net metering, REC) needs zero code/DB changes.
  * Every leaf value is a `CanonicalField` carrying value + confidence + source
    page + bounding box + ocr source + validation status (the Confidence Engine
    contract).
  * The `carbon` section is intentionally EMPTY plumbing — emission factors and
    BRSR mappings are regulated domain logic and are never invented here.

Versioned: bump SCHEMA_VERSION on any breaking change; consumers pin a version.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = "1.0.0"


class OcrSource(str, Enum):
    NATIVE_PDF = "native_pdf"
    DOCUMENT_AI = "document_ai"
    VISION = "vision"
    UNKNOWN = "unknown"


class ValidationStatus(str, Enum):
    UNVALIDATED = "UNVALIDATED"
    VALID = "VALID"
    INVALID = "INVALID"
    FLAGGED = "FLAGGED"            # plausible but could not be confirmed
    PENDING_CONFIRMATION = "PENDING_CONFIRMATION"   # needs human/domain sign-off


class BoundingBox(BaseModel):
    """Normalized [0,1] page coordinates. Optional — native PDFs may omit."""
    page: int = 1
    x: Optional[float] = None
    y: Optional[float] = None
    w: Optional[float] = None
    h: Optional[float] = None


class CanonicalField(BaseModel):
    """A single extracted value with full provenance. The atomic unit of trust."""
    canonical_label: str
    value: Any = None
    unit: Optional[str] = None
    confidence: float = 0.0
    raw_label: Optional[str] = None         # the label as printed on the document
    source_page: Optional[int] = None
    bbox: Optional[BoundingBox] = None
    ocr_source: OcrSource = OcrSource.UNKNOWN
    source_text: Optional[str] = None       # the surrounding text span
    validation_status: ValidationStatus = ValidationStatus.UNVALIDATED

    def is_present(self) -> bool:
        return self.value is not None and str(self.value).strip() != ""


# ── Structured, extensible sub-objects ────────────────────────────────────────

class MeterReading(BaseModel):
    """One metered quantity line. energy_type is canonical (KWH/KVAH/KW/KVA/...)."""
    meter_id: Optional[CanonicalField] = None
    energy_type: Optional[str] = None       # KWH | KVAH | KW | KVA | SCM | LITRE | M3 ...
    previous_reading: Optional[CanonicalField] = None
    current_reading: Optional[CanonicalField] = None
    multiplying_factor: Optional[CanonicalField] = None
    consumption: Optional[CanonicalField] = None
    recorded_demand: Optional[CanonicalField] = None
    reading_period_months: Optional[CanonicalField] = None


class EnergyFlowEntry(BaseModel):
    """Energy MOVEMENT, not just 'units consumed'. Code is canonical & open-ended:
    grid_import | grid_export | solar_generated | wind_generated | hydro_generated |
    battery_charge | battery_discharge | reactive_energy | apparent_energy |
    peak_demand | maximum_demand | p2p_sold | p2p_bought | surplus_solar ...
    New flows need no schema change."""
    code: str
    quantity: CanonicalField


class ChargeLine(BaseModel):
    """One money line. Code is canonical & open-ended:
    energy_charge | demand_charge | fixed_charge | electricity_duty | fppa | lpsc |
    tod | green_energy_charge | subsidy | arrear | tax_cgst | tax_sgst | rebate |
    excess_demand_penalty | other ...  Sign captured so totals reconcile."""
    code: str
    amount: CanonicalField
    sign: int = 1                            # +1 charge, -1 credit/rebate/subsidy


# ── Top-level sections ────────────────────────────────────────────────────────

class Section(BaseModel):
    """A bag of CanonicalFields keyed by canonical_label. Open-ended on purpose."""
    fields: dict[str, CanonicalField] = Field(default_factory=dict)

    def set(self, f: CanonicalField) -> None:
        self.fields[f.canonical_label] = f

    def get(self, label: str) -> Optional[CanonicalField]:
        return self.fields.get(label)


class ValidationCheck(BaseModel):
    name: str
    status: ValidationStatus
    detail: str = ""
    expected: Any = None
    actual: Any = None


class ValidationReport(BaseModel):
    checks: list[ValidationCheck] = Field(default_factory=list)
    overall_status: ValidationStatus = ValidationStatus.UNVALIDATED
    needs_review: bool = False
    review_reasons: list[str] = Field(default_factory=list)
    overall_confidence: float = 0.0


class UniversalEnergyDocument(BaseModel):
    """The single output of the platform. Stored normalized in ESG Core."""
    schema_version: str = SCHEMA_VERSION

    # high-level identity of the document itself
    document: Section = Field(default_factory=Section)     # doc_type, issuer, bill_number, dates
    consumer: Section = Field(default_factory=Section)     # account_number, name, tariff, load
    utility: Section = Field(default_factory=Section)      # discom, division, gstin
    location: Section = Field(default_factory=Section)     # address, pin, lat/long, site
    billing: Section = Field(default_factory=Section)      # bill_date, due_date, period, bill_amount

    meters: list[MeterReading] = Field(default_factory=list)
    energy_flow: list[EnergyFlowEntry] = Field(default_factory=list)
    charges: list[ChargeLine] = Field(default_factory=list)

    renewable: Section = Field(default_factory=Section)    # solar_capacity, surplus, net/gross
    power_quality: Section = Field(default_factory=Section)  # power_factor, max_demand

    # Empty plumbing — populated ONLY by the (domain-confirmed) Carbon Engine.
    carbon: Section = Field(default_factory=Section)

    validation: ValidationReport = Field(default_factory=ValidationReport)
    metadata: dict[str, Any] = Field(default_factory=dict)  # provider, model, timings, hashes

    def all_fields(self) -> list[CanonicalField]:
        out: list[CanonicalField] = []
        for sec in (self.document, self.consumer, self.utility, self.location,
                    self.billing, self.renewable, self.power_quality, self.carbon):
            out.extend(sec.fields.values())
        for m in self.meters:
            out.extend(x for x in (m.meter_id, m.previous_reading, m.current_reading,
                                   m.multiplying_factor, m.consumption,
                                   m.recorded_demand, m.reading_period_months) if x)
        out.extend(e.quantity for e in self.energy_flow)
        out.extend(c.amount for c in self.charges)
        return out
