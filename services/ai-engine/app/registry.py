"""Canonical Metric Registry — 200+ BRSR metrics.

Each entry is keyed by `canonical_key` and contains:
  - name: human-readable label
  - unit: canonical SI / accounting unit
  - category: top-level grouping (energy / water / waste / ghg / ...)
  - allowed_units: list of units the value may legally appear in
  - gwp_basis: only for GHG metrics ("AR4" / "AR5" / "AR6")
  - boundary_tag: GHG Protocol boundary (scope1 / scope2 / scope3 / na)
  - dimensions: list of dimension keys (e.g. fuel_type, gender, source)
  - aliases: synonyms for label matching
  - regex_patterns: legacy fast-path patterns
  - llm_hint: description used in LLM extraction prompts
  - value_constraints: {min, max, dtype}

The registry mirrors the Node backend's schema. Keep them in sync.
"""
from __future__ import annotations

from typing import Any, TypedDict


class ValueConstraints(TypedDict, total=False):
    min: float
    max: float
    dtype: str  # "float" / "int" / "string"


class MetricDef(TypedDict, total=False):
    name: str
    unit: str
    category: str
    allowed_units: list[str]
    gwp_basis: str
    boundary_tag: str
    dimensions: list[str]
    aliases: list[str]
    regex_patterns: list[str]
    llm_hint: str
    value_constraints: ValueConstraints


# ---------------------------------------------------------------------------
# Helpers used while declaring the registry
# ---------------------------------------------------------------------------


def _energy_metric(
    key: str,
    name: str,
    unit: str = "kWh",
    allowed: list[str] | None = None,
    aliases: list[str] | None = None,
    regex_patterns: list[str] | None = None,
    llm_hint: str = "",
    constraints: ValueConstraints | None = None,
) -> MetricDef:
    return {
        "name": name,
        "unit": unit,
        "category": "energy",
        "allowed_units": allowed or [unit, "MWh", "GWh", "GJ", "TJ"],
        "boundary_tag": "na",
        "dimensions": ["facility", "period"],
        "aliases": aliases or [],
        "regex_patterns": regex_patterns or [],
        "llm_hint": llm_hint,
        "value_constraints": constraints or {"min": 0, "max": 1e12, "dtype": "float"},
    }


def _ghg_metric(
    key: str,
    name: str,
    scope: str,
    aliases: list[str] | None = None,
    regex_patterns: list[str] | None = None,
    llm_hint: str = "",
) -> MetricDef:
    return {
        "name": name,
        "unit": "tCO2e",
        "category": "ghg",
        "allowed_units": ["tCO2e", "kgCO2e"],
        "gwp_basis": "AR5",
        "boundary_tag": scope,
        "dimensions": ["facility", "period"],
        "aliases": aliases or [],
        "regex_patterns": regex_patterns or [],
        "llm_hint": llm_hint,
        "value_constraints": {"min": 0, "max": 1e10, "dtype": "float"},
    }


def _scope3_cat(n: int, label: str) -> tuple[str, MetricDef]:
    key = f"scope3_emissions_cat{n}_tco2e"
    return key, _ghg_metric(
        key,
        f"Scope 3 Category {n} — {label} ({chr(40)}tCO2e{chr(41)})",
        scope="scope3",
        aliases=[
            f"scope 3 category {n}",
            f"scope-3 cat {n}",
            f"cat {n} {label.lower()}",
            label.lower(),
        ],
        regex_patterns=[
            rf"scope\s*[- ]?\s*3.{{0,30}}cat(?:egory)?\s*{n}\b.{{0,40}}([\d,\.]+)",
        ],
        llm_hint=(
            f"GHG Protocol Scope 3 Category {n} — {label}. Expressed in tonnes of CO2 equivalent."
        ),
    )


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

METRIC_REGISTRY: dict[str, MetricDef] = {}

# ---------- Energy ----------
METRIC_REGISTRY.update(
    {
        "electricity_kwh": _energy_metric(
            "electricity_kwh",
            "Total electricity consumption (kWh)",
            aliases=[
                "total electricity", "electricity consumed", "power consumption",
                "energy consumed", "electricity used", "units consumed",
            ],
            regex_patterns=[
                r"(?:total\s+)?electricity[^\n\r]{0,40}?([\d,\.]+)\s*(?:k\s*wh|kwh|units?)",
                r"power\s+consumption[^\n\r]{0,40}?([\d,\.]+)\s*(?:k\s*wh|kwh)",
            ],
            llm_hint="Total electricity consumed across all facilities for the reporting period.",
        ),
        "electricity_from_renewable_kwh": _energy_metric(
            "electricity_from_renewable_kwh",
            "Electricity from renewable sources (kWh)",
            aliases=[
                "renewable electricity", "green power", "solar electricity",
                "wind electricity", "renewable energy generated", "RE consumed",
                "rooftop solar generation",
            ],
            regex_patterns=[
                r"renewable\s+(?:electricity|energy)[^\n\r]{0,40}?([\d,\.]+)\s*(?:k\s*wh|kwh)",
                r"solar\s+(?:generation|power)[^\n\r]{0,40}?([\d,\.]+)\s*(?:k\s*wh|kwh)",
            ],
            llm_hint="Electricity from renewable sources (solar, wind, hydro, biomass, RE PPAs).",
        ),
        "electricity_from_grid_kwh": _energy_metric(
            "electricity_from_grid_kwh",
            "Electricity from grid (kWh)",
            aliases=["grid electricity", "purchased electricity", "utility electricity"],
            regex_patterns=[
                r"grid\s+(?:electricity|power|consumption)[^\n\r]{0,40}?([\d,\.]+)\s*(?:k\s*wh|kwh)",
            ],
            llm_hint="Electricity purchased from utility / grid (non-renewable).",
        ),
        "diesel_l": _energy_metric(
            "diesel_l",
            "Diesel consumption (litres)",
            unit="L",
            allowed=["L", "kL", "GJ"],
            aliases=["diesel", "HSD", "high speed diesel", "DG fuel", "generator diesel"],
            regex_patterns=[
                r"diesel[^\n\r]{0,30}?([\d,\.]+)\s*(?:l\b|litres?|liters?|kl)",
                r"HSD[^\n\r]{0,30}?([\d,\.]+)\s*(?:l\b|litres?|liters?)",
            ],
            llm_hint="Diesel fuel consumed (DG sets, vehicles, boilers).",
        ),
        "petrol_l": _energy_metric(
            "petrol_l",
            "Petrol consumption (litres)",
            unit="L",
            allowed=["L", "kL", "GJ"],
            aliases=["petrol", "gasoline", "MS", "motor spirit"],
            regex_patterns=[
                r"petrol[^\n\r]{0,30}?([\d,\.]+)\s*(?:l\b|litres?|liters?)",
                r"gasoline[^\n\r]{0,30}?([\d,\.]+)\s*(?:l\b|litres?|liters?)",
            ],
            llm_hint="Petrol / gasoline consumed in company vehicles or equipment.",
        ),
        "lpg_kg": _energy_metric(
            "lpg_kg",
            "LPG consumption (kg)",
            unit="kg",
            allowed=["kg", "tonnes", "GJ"],
            aliases=["LPG", "liquefied petroleum gas", "cooking gas"],
            regex_patterns=[r"LPG[^\n\r]{0,30}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            llm_hint="LPG (cylinders or bulk) consumed.",
        ),
        "lng_kg": _energy_metric(
            "lng_kg",
            "LNG consumption (kg)",
            unit="kg",
            allowed=["kg", "tonnes", "GJ"],
            aliases=["LNG", "liquefied natural gas"],
            llm_hint="LNG consumed for industrial heating or transport.",
        ),
        "png_scm": _energy_metric(
            "png_scm",
            "PNG / Natural Gas consumption (scm)",
            unit="scm",
            allowed=["scm", "Nm3", "GJ"],
            aliases=["PNG", "natural gas", "piped natural gas", "CNG bulk"],
            regex_patterns=[
                r"(?:PNG|natural\s+gas|piped\s+gas)[^\n\r]{0,30}?([\d,\.]+)\s*(?:scm|nm3|sm3)",
            ],
            llm_hint="Piped natural gas consumed in standard cubic metres.",
        ),
        "coal_tonnes": _energy_metric(
            "coal_tonnes",
            "Coal consumption (tonnes)",
            unit="tonnes",
            allowed=["tonnes", "kg", "GJ"],
            aliases=["coal", "lignite", "anthracite"],
            regex_patterns=[r"coal[^\n\r]{0,30}?([\d,\.]+)\s*(?:tonnes?|mt|kg)"],
            llm_hint="Coal consumed for power generation or industrial process.",
        ),
        "biomass_tonnes": _energy_metric(
            "biomass_tonnes",
            "Biomass consumption (tonnes)",
            unit="tonnes",
            allowed=["tonnes", "kg", "GJ"],
            aliases=["biomass", "agro waste", "briquettes", "wood chips"],
            llm_hint="Biomass fuel consumed.",
        ),
        "steam_purchased_gj": _energy_metric(
            "steam_purchased_gj",
            "Purchased steam (GJ)",
            unit="GJ",
            allowed=["GJ", "MJ", "tonnes"],
            aliases=["steam purchased", "steam imported"],
            llm_hint="Steam purchased from utility / third party.",
        ),
        "heat_purchased_gj": _energy_metric(
            "heat_purchased_gj",
            "Purchased heat (GJ)",
            unit="GJ",
            allowed=["GJ", "MJ"],
            aliases=["purchased heat", "district heating"],
            llm_hint="Heat purchased from external supplier.",
        ),
        "fuel_oil_l": _energy_metric(
            "fuel_oil_l",
            "Fuel oil (litres)",
            unit="L",
            allowed=["L", "kL"],
            aliases=["furnace oil", "FO", "HFO", "heavy fuel oil"],
            llm_hint="Heavy fuel oil / furnace oil consumed.",
        ),
    }
)

# ---------- Water ----------
WATER_SOURCES = ["groundwater", "surface", "third_party", "seawater", "produced"]

for src in WATER_SOURCES:
    src_label = src.replace("_", " ")
    METRIC_REGISTRY[f"water_withdrawn_{src}_kl"] = {
        "name": f"Water withdrawn — {src_label.title()} (kL)",
        "unit": "kL",
        "category": "water",
        "allowed_units": ["kL", "L", "ML"],
        "boundary_tag": "na",
        "dimensions": ["facility", "period"],
        "aliases": [
            src_label,
            f"{src_label} water",
            f"water from {src_label}",
            f"withdrawal {src_label}",
            f"{src_label} withdrawal",
        ],
        "regex_patterns": [
            rf"{src.replace('_', r'.?')}[^\n\r]{{0,30}}?([\d,\.]+)\s*(?:kl|m3|kilo\s*lit)",
        ],
        "llm_hint": f"Volume of water withdrawn from {src_label} source.",
        "value_constraints": {"min": 0, "max": 1e10, "dtype": "float"},
    }

METRIC_REGISTRY.update(
    {
        "water_withdrawn_total_kl": {
            "name": "Total water withdrawn (kL)",
            "unit": "kL",
            "category": "water",
            "allowed_units": ["kL", "L", "ML"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["total water withdrawn", "total water consumption", "freshwater withdrawal"],
            "regex_patterns": [
                r"total\s+water\s+(?:withdrawn|withdrawal)[^\n\r]{0,40}?([\d,\.]+)\s*(?:kl|m3)",
            ],
            "llm_hint": "Total volume of water withdrawn from all sources.",
            "value_constraints": {"min": 0, "max": 1e11, "dtype": "float"},
        },
        "water_discharged_kl": {
            "name": "Water discharged (kL)",
            "unit": "kL",
            "category": "water",
            "allowed_units": ["kL", "L", "ML"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period", "discharge_destination"],
            "aliases": [
                "water discharged", "effluent discharged", "wastewater discharged",
                "discharge", "discharged", "water discharge", "effluent discharge",
            ],
            "regex_patterns": [
                r"water\s+discharged[^\n\r]{0,40}?([\d,\.]+)\s*(?:kl|m3)",
                r"effluent\s+discharged[^\n\r]{0,40}?([\d,\.]+)\s*(?:kl|m3)",
            ],
            "llm_hint": "Total water discharged from operations.",
            "value_constraints": {"min": 0, "max": 1e11, "dtype": "float"},
        },
        "water_consumed_kl": {
            "name": "Water consumed (kL)",
            "unit": "kL",
            "category": "water",
            "allowed_units": ["kL", "L", "ML"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["water consumption", "net water consumption"],
            "regex_patterns": [
                r"water\s+consum(?:ed|ption)[^\n\r]{0,40}?([\d,\.]+)\s*(?:kl|m3)",
            ],
            "llm_hint": "Water consumed = withdrawn − discharged.",
            "value_constraints": {"min": 0, "max": 1e11, "dtype": "float"},
        },
        "water_recycled_kl": {
            "name": "Water recycled / reused (kL)",
            "unit": "kL",
            "category": "water",
            "allowed_units": ["kL", "L", "ML"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["water recycled", "water reused", "recycled water"],
            "regex_patterns": [
                r"water\s+(?:recycled|reused)[^\n\r]{0,40}?([\d,\.]+)\s*(?:kl|m3)",
            ],
            "llm_hint": "Water recycled / reused within facility.",
            "value_constraints": {"min": 0, "max": 1e11, "dtype": "float"},
        },
    }
)

# ---------- Waste ----------
METRIC_REGISTRY.update(
    {
        "waste_hazardous_kg": {
            "name": "Hazardous waste generated (kg)",
            "unit": "kg",
            "category": "waste",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period", "waste_category"],
            "aliases": ["hazardous waste", "haz waste", "schedule 1 waste"],
            "regex_patterns": [r"hazardous\s+waste[^\n\r]{0,40}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            "llm_hint": "Total hazardous waste generated as classified under Hazardous Waste Rules.",
            "value_constraints": {"min": 0, "max": 1e9, "dtype": "float"},
        },
        "waste_non_hazardous_kg": {
            "name": "Non-hazardous waste generated (kg)",
            "unit": "kg",
            "category": "waste",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["non-hazardous waste", "general waste", "municipal solid waste"],
            "regex_patterns": [r"non[\s-]?hazardous\s+waste[^\n\r]{0,40}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            "llm_hint": "Non-hazardous solid waste generated.",
            "value_constraints": {"min": 0, "max": 1e9, "dtype": "float"},
        },
        "waste_recycled_kg": {
            "name": "Waste recycled (kg)",
            "unit": "kg",
            "category": "waste",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["waste recycled", "recycled waste", "recovered for recycling"],
            "regex_patterns": [r"waste\s+recycled[^\n\r]{0,40}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            "llm_hint": "Quantity of waste sent for recycling / recovery.",
            "value_constraints": {"min": 0, "max": 1e9, "dtype": "float"},
        },
        "waste_to_landfill_kg": {
            "name": "Waste sent to landfill (kg)",
            "unit": "kg",
            "category": "waste",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["landfill waste", "waste to landfill", "disposal landfill"],
            "regex_patterns": [r"(?:waste\s+to\s+)?landfill[^\n\r]{0,40}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            "llm_hint": "Quantity of waste disposed of by landfilling.",
            "value_constraints": {"min": 0, "max": 1e9, "dtype": "float"},
        },
        "waste_to_incineration_kg": {
            "name": "Waste sent to incineration (kg)",
            "unit": "kg",
            "category": "waste",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["incineration", "incinerated waste", "waste incinerated"],
            "regex_patterns": [r"incinerat(?:ion|ed)[^\n\r]{0,40}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            "llm_hint": "Quantity of waste incinerated (with/without energy recovery).",
            "value_constraints": {"min": 0, "max": 1e9, "dtype": "float"},
        },
        "waste_to_coprocessing_kg": {
            "name": "Waste sent to co-processing (kg)",
            "unit": "kg",
            "category": "waste",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["co-processing", "coprocessing", "cement kiln coprocessing"],
            "llm_hint": "Waste sent to cement kilns for co-processing.",
            "value_constraints": {"min": 0, "max": 1e9, "dtype": "float"},
        },
        "e_waste_kg": {
            "name": "E-waste generated (kg)",
            "unit": "kg",
            "category": "waste",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["e-waste", "electronic waste", "WEEE"],
            "regex_patterns": [r"e[\s-]?waste[^\n\r]{0,40}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            "llm_hint": "Electronic waste generated covered under E-Waste Rules.",
            "value_constraints": {"min": 0, "max": 1e8, "dtype": "float"},
        },
        "plastic_waste_kg": {
            "name": "Plastic waste generated (kg)",
            "unit": "kg",
            "category": "waste",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period", "plastic_category"],
            "aliases": ["plastic waste", "EPR plastic", "post-consumer plastic"],
            "regex_patterns": [r"plastic\s+waste[^\n\r]{0,40}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            "llm_hint": "Plastic waste covered under Plastic Waste Rules / EPR.",
            "value_constraints": {"min": 0, "max": 1e9, "dtype": "float"},
        },
        "biomedical_waste_kg": {
            "name": "Bio-medical waste (kg)",
            "unit": "kg",
            "category": "waste",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["biomedical waste", "bio-medical waste", "BMW"],
            "llm_hint": "Bio-medical waste under BMW Rules.",
            "value_constraints": {"min": 0, "max": 1e8, "dtype": "float"},
        },
        "battery_waste_kg": {
            "name": "Battery waste (kg)",
            "unit": "kg",
            "category": "waste",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["battery waste", "used batteries"],
            "llm_hint": "Battery waste under Battery Waste Management Rules.",
            "value_constraints": {"min": 0, "max": 1e8, "dtype": "float"},
        },
        "construction_demolition_waste_kg": {
            "name": "Construction & demolition waste (kg)",
            "unit": "kg",
            "category": "waste",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["C&D waste", "construction waste", "demolition waste"],
            "llm_hint": "C&D waste generated.",
            "value_constraints": {"min": 0, "max": 1e10, "dtype": "float"},
        },
    }
)

# ---------- GHG ----------
METRIC_REGISTRY["scope1_emissions_tco2e"] = _ghg_metric(
    "scope1_emissions_tco2e",
    "Scope 1 GHG emissions (tCO2e)",
    scope="scope1",
    aliases=["scope 1", "scope-1", "direct emissions", "direct ghg"],
    regex_patterns=[
        r"scope\s*[- ]?\s*1[^\n\r]{0,40}?([\d,\.]+)\s*(?:t\s*co2|tco2e|tonnes?\s*co2)",
        r"direct\s+emissions[^\n\r]{0,40}?([\d,\.]+)\s*(?:t\s*co2|tco2e)",
    ],
    llm_hint="Direct GHG emissions from owned/controlled sources (combustion, fugitives).",
)
METRIC_REGISTRY["scope2_emissions_location_tco2e"] = _ghg_metric(
    "scope2_emissions_location_tco2e",
    "Scope 2 GHG emissions — Location-based (tCO2e)",
    scope="scope2",
    aliases=["scope 2 location", "location based", "location-based scope 2"],
    regex_patterns=[
        r"scope\s*[- ]?\s*2[^\n\r]{0,40}?location[^\n\r]{0,40}?([\d,\.]+)",
    ],
    llm_hint="Scope 2 (purchased energy) emissions using grid-average emission factor (location-based).",
)
METRIC_REGISTRY["scope2_emissions_market_tco2e"] = _ghg_metric(
    "scope2_emissions_market_tco2e",
    "Scope 2 GHG emissions — Market-based (tCO2e)",
    scope="scope2",
    aliases=["scope 2 market", "market based", "market-based scope 2"],
    regex_patterns=[
        r"scope\s*[- ]?\s*2[^\n\r]{0,40}?market[^\n\r]{0,40}?([\d,\.]+)",
    ],
    llm_hint="Scope 2 emissions using contractual instruments (PPAs, RECs).",
)

_S3_CATEGORIES = [
    "Purchased goods and services",
    "Capital goods",
    "Fuel- and energy-related activities",
    "Upstream transportation and distribution",
    "Waste generated in operations",
    "Business travel",
    "Employee commuting",
    "Upstream leased assets",
    "Downstream transportation and distribution",
    "Processing of sold products",
    "Use of sold products",
    "End-of-life treatment of sold products",
    "Downstream leased assets",
    "Franchises",
    "Investments",
]
for i, label in enumerate(_S3_CATEGORIES, start=1):
    k, defn = _scope3_cat(i, label)
    METRIC_REGISTRY[k] = defn

# ---------- Air emissions ----------
METRIC_REGISTRY.update(
    {
        "nox_kg": {
            "name": "NOx emissions (kg)",
            "unit": "kg",
            "category": "air_emissions",
            "allowed_units": ["kg", "tonnes", "mg/Nm3"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["NOx", "oxides of nitrogen", "NO2"],
            "regex_patterns": [r"(?:NOx|oxides\s+of\s+nitrogen)[^\n\r]{0,40}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            "llm_hint": "Oxides of nitrogen released as air emissions.",
            "value_constraints": {"min": 0, "max": 1e8, "dtype": "float"},
        },
        "sox_kg": {
            "name": "SOx emissions (kg)",
            "unit": "kg",
            "category": "air_emissions",
            "allowed_units": ["kg", "tonnes", "mg/Nm3"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["SOx", "SO2", "sulphur dioxide"],
            "regex_patterns": [r"(?:SOx|SO2|sulphur\s+dioxide)[^\n\r]{0,40}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            "llm_hint": "Sulphur oxides released as air emissions.",
            "value_constraints": {"min": 0, "max": 1e8, "dtype": "float"},
        },
        "pm_kg": {
            "name": "Particulate matter emissions (kg)",
            "unit": "kg",
            "category": "air_emissions",
            "allowed_units": ["kg", "tonnes", "mg/Nm3"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period", "pm_size"],
            "aliases": ["PM", "PM10", "PM2.5", "particulates", "SPM"],
            "regex_patterns": [r"(?:PM|SPM|particulate(?:s)?)[^\n\r]{0,40}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            "llm_hint": "Total particulate matter released.",
            "value_constraints": {"min": 0, "max": 1e8, "dtype": "float"},
        },
        "voc_kg": {
            "name": "VOC emissions (kg)",
            "unit": "kg",
            "category": "air_emissions",
            "allowed_units": ["kg", "tonnes"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["VOC", "volatile organic compounds"],
            "regex_patterns": [r"VOC[^\n\r]{0,40}?([\d,\.]+)\s*(?:kg|tonnes?)"],
            "llm_hint": "Volatile organic compounds released.",
            "value_constraints": {"min": 0, "max": 1e8, "dtype": "float"},
        },
        "pops_kg": {
            "name": "Persistent organic pollutants (kg)",
            "unit": "kg",
            "category": "air_emissions",
            "allowed_units": ["kg"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["POP", "POPs", "persistent organic pollutants"],
            "llm_hint": "Persistent organic pollutants released.",
            "value_constraints": {"min": 0, "max": 1e6, "dtype": "float"},
        },
        "haps_kg": {
            "name": "Hazardous air pollutants (kg)",
            "unit": "kg",
            "category": "air_emissions",
            "allowed_units": ["kg"],
            "boundary_tag": "na",
            "dimensions": ["facility", "period"],
            "aliases": ["HAP", "HAPs", "hazardous air pollutants"],
            "llm_hint": "Hazardous air pollutants released.",
            "value_constraints": {"min": 0, "max": 1e6, "dtype": "float"},
        },
    }
)

# ---------- Social — Workforce ----------
def _hc(key: str, name: str, aliases: list[str], dim: list[str] | None = None) -> MetricDef:
    return {
        "name": name,
        "unit": "count",
        "category": "workforce",
        "allowed_units": ["count"],
        "boundary_tag": "na",
        "dimensions": dim or ["period"],
        "aliases": aliases,
        "regex_patterns": [
            rf"{aliases[0]}[^\n\r]{{0,40}}?([\d,]+)",
        ],
        "llm_hint": name,
        "value_constraints": {"min": 0, "max": 1e7, "dtype": "int"},
    }


METRIC_REGISTRY.update(
    {
        "employee_count_total": _hc(
            "employee_count_total",
            "Total employee count",
            ["total employees", "total headcount", "permanent employees", "total workforce"],
        ),
        "employee_count_male": _hc(
            "employee_count_male", "Male employee count",
            ["male employees", "men employees", "male headcount"],
        ),
        "employee_count_female": _hc(
            "employee_count_female", "Female employee count",
            ["female employees", "women employees", "female headcount"],
        ),
        "employee_count_lgbtq": _hc(
            "employee_count_lgbtq", "LGBTQ+ employees",
            ["lgbtq employees", "lgbtqia", "other gender employees"],
        ),
        "employee_count_pwd": _hc(
            "employee_count_pwd", "Employees with disabilities",
            ["persons with disabilities", "differently abled", "PwD employees"],
        ),
        "employee_count_permanent": _hc(
            "employee_count_permanent", "Permanent employees",
            ["permanent employees", "regular employees", "on-roll employees"],
        ),
        "contract_workers_count": _hc(
            "contract_workers_count", "Contract workers",
            ["contract workers", "contractual workforce", "third-party workers", "outsourced workers"],
        ),
        "trainees_count": _hc(
            "trainees_count", "Trainees / apprentices",
            ["trainees", "apprentices", "interns"],
        ),
        "workers_male_count": _hc(
            "workers_male_count", "Male contract workers",
            ["male workers", "male contract workers"],
        ),
        "workers_female_count": _hc(
            "workers_female_count", "Female contract workers",
            ["female workers", "female contract workers"],
        ),
        "women_in_management_pct": {
            "name": "Women in management (%)",
            "unit": "pct",
            "category": "workforce",
            "allowed_units": ["pct"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["women in management", "female managers %", "women in leadership"],
            "regex_patterns": [r"women\s+in\s+management[^\n\r]{0,30}?([\d,\.]+)\s*%"],
            "llm_hint": "Percentage of management positions held by women.",
            "value_constraints": {"min": 0, "max": 100, "dtype": "float"},
        },
        "women_on_board_pct": {
            "name": "Women on board (%)",
            "unit": "pct",
            "category": "governance",
            "allowed_units": ["pct"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["women on board", "women directors %", "gender diversity board"],
            "regex_patterns": [r"women\s+(?:on\s+)?board[^\n\r]{0,30}?([\d,\.]+)\s*%"],
            "llm_hint": "Percentage of women on the board of directors.",
            "value_constraints": {"min": 0, "max": 100, "dtype": "float"},
        },
        "attrition_rate_pct": {
            "name": "Attrition rate (%)",
            "unit": "pct",
            "category": "workforce",
            "allowed_units": ["pct"],
            "boundary_tag": "na",
            "dimensions": ["period", "gender", "level"],
            "aliases": ["attrition rate", "turnover rate", "exit rate"],
            "regex_patterns": [r"attrition[^\n\r]{0,40}?([\d,\.]+)\s*%"],
            "llm_hint": "Annual employee attrition / turnover rate.",
            "value_constraints": {"min": 0, "max": 100, "dtype": "float"},
        },
        "median_remuneration_male": {
            "name": "Median remuneration — male (INR)",
            "unit": "INR",
            "category": "workforce",
            "allowed_units": ["INR", "INR_lakh", "USD"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["median salary male", "median remuneration men"],
            "regex_patterns": [r"median[^\n\r]{0,40}?male[^\n\r]{0,40}?([\d,\.]+)"],
            "llm_hint": "Median annual remuneration of male employees.",
            "value_constraints": {"min": 0, "max": 1e10, "dtype": "float"},
        },
        "median_remuneration_female": {
            "name": "Median remuneration — female (INR)",
            "unit": "INR",
            "category": "workforce",
            "allowed_units": ["INR", "INR_lakh", "USD"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["median salary female", "median remuneration women"],
            "regex_patterns": [r"median[^\n\r]{0,40}?female[^\n\r]{0,40}?([\d,\.]+)"],
            "llm_hint": "Median annual remuneration of female employees.",
            "value_constraints": {"min": 0, "max": 1e10, "dtype": "float"},
        },
        "gender_pay_gap_pct": {
            "name": "Gender pay gap (%)",
            "unit": "pct",
            "category": "workforce",
            "allowed_units": ["pct"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["gender pay gap", "gender wage gap"],
            "llm_hint": "Percentage gap between median male and female remuneration.",
            "value_constraints": {"min": -100, "max": 100, "dtype": "float"},
        },
    }
)

# ---------- Training ----------
METRIC_REGISTRY.update(
    {
        "training_hours_total": {
            "name": "Total training hours",
            "unit": "hours",
            "category": "training",
            "allowed_units": ["hours"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["training hours", "total training time"],
            "regex_patterns": [r"training\s+hours[^\n\r]{0,40}?([\d,\.]+)"],
            "llm_hint": "Total training hours delivered to employees.",
            "value_constraints": {"min": 0, "max": 1e8, "dtype": "float"},
        },
        "training_hours_health_safety": {
            "name": "Training hours — health & safety",
            "unit": "hours",
            "category": "training",
            "allowed_units": ["hours"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["health safety training", "EHS training", "safety training"],
            "llm_hint": "Training hours on health and safety topics.",
            "value_constraints": {"min": 0, "max": 1e8, "dtype": "float"},
        },
        "training_hours_skill_upgrade": {
            "name": "Training hours — skill upgrade",
            "unit": "hours",
            "category": "training",
            "allowed_units": ["hours"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["skill upgrade training", "upskilling hours"],
            "llm_hint": "Training hours on skill upgrades / professional development.",
            "value_constraints": {"min": 0, "max": 1e8, "dtype": "float"},
        },
        "training_hours_human_rights": {
            "name": "Training hours — human rights",
            "unit": "hours",
            "category": "training",
            "allowed_units": ["hours"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["human rights training"],
            "llm_hint": "Training hours on human rights awareness.",
            "value_constraints": {"min": 0, "max": 1e7, "dtype": "float"},
        },
        "training_coverage_pct": {
            "name": "Training coverage (%)",
            "unit": "pct",
            "category": "training",
            "allowed_units": ["pct"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["training coverage", "% employees trained"],
            "llm_hint": "Percentage of employees trained.",
            "value_constraints": {"min": 0, "max": 100, "dtype": "float"},
        },
    }
)

# ---------- Health & Safety ----------
METRIC_REGISTRY.update(
    {
        "ltifr": {
            "name": "Lost Time Injury Frequency Rate (LTIFR)",
            "unit": "per_million_hours",
            "category": "health_safety",
            "allowed_units": ["per_million_hours", "count"],
            "boundary_tag": "na",
            "dimensions": ["period", "employee_type"],
            "aliases": ["LTIFR", "lost time injury frequency rate"],
            "regex_patterns": [r"LTIFR[^\n\r]{0,30}?([\d,\.]+)"],
            "llm_hint": "Lost Time Injury Frequency Rate per million man-hours worked.",
            "value_constraints": {"min": 0, "max": 1000, "dtype": "float"},
        },
        "trifr": {
            "name": "Total Recordable Injury Frequency Rate (TRIFR)",
            "unit": "per_million_hours",
            "category": "health_safety",
            "allowed_units": ["per_million_hours", "count"],
            "boundary_tag": "na",
            "dimensions": ["period", "employee_type"],
            "aliases": ["TRIFR", "total recordable injury frequency rate"],
            "regex_patterns": [r"TRIFR[^\n\r]{0,30}?([\d,\.]+)"],
            "llm_hint": "Total Recordable Injury Frequency Rate per million man-hours.",
            "value_constraints": {"min": 0, "max": 1000, "dtype": "float"},
        },
        "fatality_count": {
            "name": "Fatalities",
            "unit": "count",
            "category": "health_safety",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period", "employee_type"],
            "aliases": ["fatalities", "fatal accidents", "workplace deaths"],
            "regex_patterns": [r"fatalit(?:y|ies)[^\n\r]{0,30}?([\d,]+)"],
            "llm_hint": "Number of work-related fatalities.",
            "value_constraints": {"min": 0, "max": 1e6, "dtype": "int"},
        },
        "near_miss_count": {
            "name": "Near miss incidents",
            "unit": "count",
            "category": "health_safety",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["near miss", "near misses", "narrowly avoided incidents"],
            "regex_patterns": [r"near\s+miss(?:es)?[^\n\r]{0,30}?([\d,]+)"],
            "llm_hint": "Number of near-miss incidents reported.",
            "value_constraints": {"min": 0, "max": 1e6, "dtype": "int"},
        },
        "occupational_disease_cases": {
            "name": "Occupational disease cases",
            "unit": "count",
            "category": "health_safety",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["occupational disease", "occupational illness cases"],
            "llm_hint": "Cases of work-related diseases.",
            "value_constraints": {"min": 0, "max": 1e6, "dtype": "int"},
        },
        "lost_days_count": {
            "name": "Lost days due to injury / illness",
            "unit": "days",
            "category": "health_safety",
            "allowed_units": ["days"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["lost days", "man-days lost", "absenteeism days"],
            "llm_hint": "Days lost due to injury / illness.",
            "value_constraints": {"min": 0, "max": 1e7, "dtype": "float"},
        },
        "safety_audits_count": {
            "name": "Safety audits conducted",
            "unit": "count",
            "category": "health_safety",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["safety audits", "EHS audits"],
            "llm_hint": "Number of safety audits conducted.",
            "value_constraints": {"min": 0, "max": 1e6, "dtype": "int"},
        },
    }
)

# ---------- Community / CSR ----------
METRIC_REGISTRY.update(
    {
        "csr_spend_inr": {
            "name": "CSR spend (INR)",
            "unit": "INR",
            "category": "community",
            "allowed_units": ["INR", "INR_lakh", "INR_crore"],
            "boundary_tag": "na",
            "dimensions": ["period", "csr_theme"],
            "aliases": ["CSR spend", "CSR expenditure", "CSR amount"],
            "regex_patterns": [
                r"CSR[^\n\r]{0,40}?(?:spend|expenditure|amount)[^\n\r]{0,30}?([\d,\.]+)\s*(?:lakh|crore|rs|inr|₹)?",
            ],
            "llm_hint": "Corporate Social Responsibility spend during the year.",
            "value_constraints": {"min": 0, "max": 1e15, "dtype": "float"},
        },
        "csr_beneficiaries_count": {
            "name": "CSR beneficiaries",
            "unit": "count",
            "category": "community",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["beneficiaries", "people impacted", "lives touched"],
            "regex_patterns": [r"beneficiar(?:y|ies)[^\n\r]{0,30}?([\d,]+)"],
            "llm_hint": "Number of beneficiaries of CSR programs.",
            "value_constraints": {"min": 0, "max": 1e10, "dtype": "int"},
        },
        "local_procurement_pct": {
            "name": "Local procurement (%)",
            "unit": "pct",
            "category": "community",
            "allowed_units": ["pct"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["local procurement", "local sourcing %"],
            "llm_hint": "Percentage of procurement spend from local / MSME suppliers.",
            "value_constraints": {"min": 0, "max": 100, "dtype": "float"},
        },
    }
)

# ---------- Grievances ----------
GRIEVANCE_GROUPS = ["employees", "consumers", "workers", "community", "shareholders", "value_chain"]
for grp in GRIEVANCE_GROUPS:
    METRIC_REGISTRY[f"complaints_received_{grp}"] = {
        "name": f"Complaints received — {grp.replace('_', ' ')}",
        "unit": "count",
        "category": "grievances",
        "allowed_units": ["count"],
        "boundary_tag": "na",
        "dimensions": ["period"],
        "aliases": [f"complaints from {grp.replace('_', ' ')}", f"grievances {grp.replace('_', ' ')} received"],
        "regex_patterns": [rf"complaints?\s+received[^\n\r]{{0,40}}?{grp}[^\n\r]{{0,30}}?([\d,]+)"],
        "llm_hint": f"Number of complaints received from {grp.replace('_', ' ')}.",
        "value_constraints": {"min": 0, "max": 1e8, "dtype": "int"},
    }
    METRIC_REGISTRY[f"complaints_resolved_{grp}"] = {
        "name": f"Complaints resolved — {grp.replace('_', ' ')}",
        "unit": "count",
        "category": "grievances",
        "allowed_units": ["count"],
        "boundary_tag": "na",
        "dimensions": ["period"],
        "aliases": [f"complaints resolved {grp.replace('_', ' ')}"],
        "regex_patterns": [rf"complaints?\s+resolved[^\n\r]{{0,40}}?{grp}[^\n\r]{{0,30}}?([\d,]+)"],
        "llm_hint": f"Number of complaints resolved from {grp.replace('_', ' ')}.",
        "value_constraints": {"min": 0, "max": 1e8, "dtype": "int"},
    }
    METRIC_REGISTRY[f"complaints_pending_{grp}"] = {
        "name": f"Complaints pending — {grp.replace('_', ' ')}",
        "unit": "count",
        "category": "grievances",
        "allowed_units": ["count"],
        "boundary_tag": "na",
        "dimensions": ["period"],
        "aliases": [f"complaints pending {grp.replace('_', ' ')}"],
        "regex_patterns": [rf"complaints?\s+pending[^\n\r]{{0,40}}?{grp}[^\n\r]{{0,30}}?([\d,]+)"],
        "llm_hint": f"Number of complaints pending from {grp.replace('_', ' ')} at year-end.",
        "value_constraints": {"min": 0, "max": 1e8, "dtype": "int"},
    }

# ---------- Governance ----------
METRIC_REGISTRY.update(
    {
        "board_size": {
            "name": "Board size",
            "unit": "count",
            "category": "governance",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["board size", "number of directors", "total directors"],
            "regex_patterns": [r"(?:total\s+)?(?:directors?|board\s+size)[^\n\r]{0,30}?([\d,]+)"],
            "llm_hint": "Number of board members.",
            "value_constraints": {"min": 0, "max": 200, "dtype": "int"},
        },
        "independent_directors_count": {
            "name": "Independent directors",
            "unit": "count",
            "category": "governance",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["independent directors", "non-executive independent directors"],
            "regex_patterns": [r"independent\s+directors?[^\n\r]{0,30}?([\d,]+)"],
            "llm_hint": "Number of independent directors on the board.",
            "value_constraints": {"min": 0, "max": 200, "dtype": "int"},
        },
        "women_directors_count": {
            "name": "Women directors",
            "unit": "count",
            "category": "governance",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["women directors", "female directors"],
            "regex_patterns": [r"women\s+directors?[^\n\r]{0,30}?([\d,]+)"],
            "llm_hint": "Number of women directors on the board.",
            "value_constraints": {"min": 0, "max": 200, "dtype": "int"},
        },
        "board_meetings_count": {
            "name": "Board meetings held",
            "unit": "count",
            "category": "governance",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["board meetings", "no. of board meetings"],
            "regex_patterns": [r"board\s+meetings?[^\n\r]{0,30}?([\d,]+)"],
            "llm_hint": "Number of board meetings held during the year.",
            "value_constraints": {"min": 0, "max": 1000, "dtype": "int"},
        },
        "anticorruption_training_pct": {
            "name": "Anti-corruption training coverage (%)",
            "unit": "pct",
            "category": "governance",
            "allowed_units": ["pct"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["anti-corruption training", "anti-bribery training coverage"],
            "llm_hint": "Percentage of employees / directors trained on anti-corruption.",
            "value_constraints": {"min": 0, "max": 100, "dtype": "float"},
        },
        "whistleblower_cases_count": {
            "name": "Whistleblower cases",
            "unit": "count",
            "category": "governance",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["whistleblower complaints", "vigil mechanism cases"],
            "llm_hint": "Number of cases reported via whistleblower / vigil mechanism.",
            "value_constraints": {"min": 0, "max": 1e6, "dtype": "int"},
        },
        "anticorruption_incidents_count": {
            "name": "Confirmed anti-corruption incidents",
            "unit": "count",
            "category": "governance",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["bribery incidents", "corruption cases"],
            "llm_hint": "Confirmed cases of bribery or corruption.",
            "value_constraints": {"min": 0, "max": 1e6, "dtype": "int"},
        },
        "directors_with_independence_certification": {
            "name": "Directors with independence certification",
            "unit": "count",
            "category": "governance",
            "allowed_units": ["count"],
            "boundary_tag": "na",
            "dimensions": ["period"],
            "aliases": ["independence declarations"],
            "llm_hint": "Number of independent directors who have submitted declarations of independence.",
            "value_constraints": {"min": 0, "max": 200, "dtype": "int"},
        },
    }
)

# ---------- Financial ----------
def _money(key: str, name: str, aliases: list[str]) -> MetricDef:
    return {
        "name": name,
        "unit": "INR",
        "category": "financial",
        "allowed_units": ["INR", "INR_lakh", "INR_crore", "USD"],
        "boundary_tag": "na",
        "dimensions": ["period"],
        "aliases": aliases,
        "regex_patterns": [rf"{aliases[0]}[^\n\r]{{0,40}}?([\d,\.]+)\s*(?:lakh|crore|rs|inr|₹)?"],
        "llm_hint": name,
        "value_constraints": {"min": 0, "max": 1e16, "dtype": "float"},
    }


METRIC_REGISTRY.update(
    {
        "turnover_inr": _money("turnover_inr", "Turnover (INR)", ["turnover", "revenue from operations", "net sales"]),
        "capex_inr": _money("capex_inr", "Capital expenditure (INR)", ["capex", "capital expenditure", "fixed asset additions"]),
        "opex_inr": _money("opex_inr", "Operating expenditure (INR)", ["opex", "operating expenses", "operating costs"]),
        "rd_spend_inr": _money("rd_spend_inr", "R&D spend (INR)", ["R&D spend", "research and development", "R&D expenditure"]),
        "sustainability_capex_inr": _money(
            "sustainability_capex_inr",
            "Sustainability capex (INR)",
            ["green capex", "sustainability capex", "ESG capex"],
        ),
        "fines_paid_inr": _money(
            "fines_paid_inr",
            "Fines / penalties paid (INR)",
            ["fines paid", "penalties paid", "regulatory fines"],
        ),
        "taxes_paid_inr": _money(
            "taxes_paid_inr",
            "Taxes paid (INR)",
            ["taxes paid", "corporate tax", "income tax paid"],
        ),
        "ebitda_inr": _money(
            "ebitda_inr",
            "EBITDA (INR)",
            ["EBITDA", "earnings before interest tax depreciation"],
        ),
        "profit_after_tax_inr": _money(
            "profit_after_tax_inr",
            "Profit after tax (INR)",
            ["PAT", "profit after tax", "net profit"],
        ),
    }
)


# ---------- Public API ----------
def get_metric(key: str) -> MetricDef | None:
    return METRIC_REGISTRY.get(key)


def all_keys() -> list[str]:
    return list(METRIC_REGISTRY.keys())


def keys_by_category(category: str) -> list[str]:
    return [k for k, v in METRIC_REGISTRY.items() if v.get("category") == category]


def alias_index() -> dict[str, str]:
    """Lowercase alias → canonical_key. Built once and cached at import time."""
    return _ALIAS_INDEX


def _build_alias_index() -> dict[str, str]:
    idx: dict[str, str] = {}
    for k, v in METRIC_REGISTRY.items():
        idx[v["name"].lower()] = k
        idx[k.lower()] = k
        for alias in v.get("aliases", []):
            idx[alias.lower().strip()] = k
    return idx


_ALIAS_INDEX = _build_alias_index()


def find_by_alias(text: str) -> str | None:
    t = text.lower().strip()
    if t in _ALIAS_INDEX:
        return _ALIAS_INDEX[t]
    # substring fallback (most-specific first)
    for alias in sorted(_ALIAS_INDEX.keys(), key=len, reverse=True):
        if alias in t:
            return _ALIAS_INDEX[alias]
    return None
