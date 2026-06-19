"""Document-specific extraction schemas. These are the JSON Schemas the LLM
fills via OpenAI structured outputs (`response_format`). Each maps 1:1 to a
backend ExtractionResult.schemaCode.
"""
from typing import Optional
from pydantic import BaseModel, Field


# ── Common ───────────────────────────────────────────────────────────────

class CommonProvenance(BaseModel):
    """Common metadata every extractor populates."""
    confidence: float = Field(0.0, description="Overall extractor confidence 0..1")


# ── ELECTRICITY_BILL_V1 ──────────────────────────────────────────────────

class ElectricityBillV1(BaseModel):
    schema_code: str = Field("ELECTRICITY_BILL_V1", description="Fixed identifier")

    discom_name: Optional[str] = Field(None, description='DISCOM/utility provider, e.g. "MSEDCL"')
    consumer_number: Optional[str] = None
    consumer_name: Optional[str] = None
    facility_address: Optional[str] = None

    billing_month: Optional[str] = Field(None, description='Human label, e.g. "Dec-2025"')
    period_start: Optional[str] = Field(None, description="ISO YYYY-MM-DD")
    period_end: Optional[str] = None
    bill_date: Optional[str] = None
    due_date: Optional[str] = None

    units_consumed_kwh: Optional[float] = Field(None, description="Energy consumed in kWh")
    bill_amount_inr: Optional[float] = None
    meter_number: Optional[str] = None
    tariff_category: Optional[str] = None
    contract_demand_kva: Optional[float] = None
    sanctioned_load_kw: Optional[float] = None
    power_factor: Optional[float] = None

    confidence: float = 0.0


# ── DIESEL_BILL_V1 ───────────────────────────────────────────────────────

class DieselBillV1(BaseModel):
    schema_code: str = Field("DIESEL_BILL_V1", description="Fixed identifier")

    oil_company: Optional[str] = Field(None, description='e.g. "BPCL", "HPCL", "IOCL"')
    invoice_number: Optional[str] = None
    delivery_address: Optional[str] = None
    customer_account: Optional[str] = None

    delivery_date: Optional[str] = Field(None, description="ISO YYYY-MM-DD")
    invoice_date: Optional[str] = None

    fuel_type: Optional[str] = Field(None, description='"HIGH_SPEED_DIESEL" | "FURNACE_OIL" | "PETROL"')
    quantity_litres: Optional[float] = None
    unit_price_inr_per_l: Optional[float] = None
    bill_amount_inr: Optional[float] = None

    intended_use: Optional[str] = Field(None, description='"STATIONARY_GENSET" | "MOBILE_FLEET" | "OTHER"')

    confidence: float = 0.0


# ── WATER_BILL_V1 ────────────────────────────────────────────────────────

class WaterBillV1(BaseModel):
    schema_code: str = Field("WATER_BILL_V1", description="Fixed identifier")

    provider_name: Optional[str] = Field(None, description="Municipal/private water utility")
    consumer_number: Optional[str] = None
    consumer_name: Optional[str] = None
    facility_address: Optional[str] = None

    period_start: Optional[str] = None
    period_end: Optional[str] = None
    bill_date: Optional[str] = None

    water_consumed_m3: Optional[float] = None
    bill_amount_inr: Optional[float] = None

    confidence: float = 0.0


# ── PNG_BILL_V1 ──────────────────────────────────────────────────────────

class PngBillV1(BaseModel):
    schema_code: str = Field("PNG_BILL_V1", description="Fixed identifier")

    provider_name: Optional[str] = Field(None, description='e.g. "GAIL", "Mahanagar Gas"')
    consumer_number: Optional[str] = None
    consumer_name: Optional[str] = None

    period_start: Optional[str] = None
    period_end: Optional[str] = None
    bill_date: Optional[str] = None

    png_consumed_m3: Optional[float] = None
    bill_amount_inr: Optional[float] = None

    confidence: float = 0.0


# ── UNKNOWN_V1 ───────────────────────────────────────────────────────────

class UnknownV1(BaseModel):
    schema_code: str = Field("UNKNOWN_V1", description="Fixed identifier")
    doc_type_guess: Optional[str] = Field(None, description="Best guess if any")
    raw_summary: Optional[str] = None
    confidence: float = 0.0


# Convenience map
SCHEMA_FOR_DOC_TYPE = {
    "ELECTRICITY_BILL": ElectricityBillV1,
    "DIESEL_BILL":      DieselBillV1,
    "WATER_BILL":       WaterBillV1,
    "PNG_BILL":         PngBillV1,
    "UNKNOWN":          UnknownV1,
}

SCHEMA_CODE_FOR_DOC_TYPE = {
    "ELECTRICITY_BILL": "ELECTRICITY_BILL_V1",
    "DIESEL_BILL":      "DIESEL_BILL_V1",
    "WATER_BILL":       "WATER_BILL_V1",
    "PNG_BILL":         "PNG_BILL_V1",
    "UNKNOWN":          "UNKNOWN_V1",
}
