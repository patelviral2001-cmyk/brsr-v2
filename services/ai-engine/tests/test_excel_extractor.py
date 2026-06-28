"""Excel extractor tests across HR, fuel, water, waste sheets."""
from __future__ import annotations

import pytest

from app.extractors.base import ExtractionContext
from app.extractors.excel import ExcelExtractor


async def _run(bytes_: bytes, filename: str):
    ext = ExcelExtractor()
    ctx = ExtractionContext(file_id="f", tenant_id="t", filename=filename, file_bytes=bytes_)
    return await ext.extract(ctx)


async def test_excel_hr_sheet_extracts_headcount(sample_xlsx_hr_bytes):
    result = await _run(sample_xlsx_hr_bytes, "headcount.xlsx")
    keys = {rf.canonical_key for rf in result.raw_fields if rf.canonical_key}
    assert "employee_count_total" in keys
    assert "employee_count_male" in keys
    assert "employee_count_female" in keys
    totals = {rf.canonical_key: rf.value_num for rf in result.raw_fields}
    assert totals.get("employee_count_total") == 4
    assert totals.get("employee_count_male") == 2
    assert totals.get("employee_count_female") == 2


async def test_excel_fuel_sheet_extracts_diesel(sample_xlsx_fuel_bytes):
    result = await _run(sample_xlsx_fuel_bytes, "fuel.xlsx")
    diesel = next((rf for rf in result.raw_fields if rf.canonical_key == "diesel_l"), None)
    assert diesel is not None
    assert diesel.value_num == 1000 + 1100 + 950


async def test_excel_water_sheet_extracts_sources(sample_xlsx_water_bytes):
    result = await _run(sample_xlsx_water_bytes, "water.xlsx")
    keys = {rf.canonical_key for rf in result.raw_fields if rf.canonical_key}
    # 'water_withdrawn_groundwater_kl' and 'water_withdrawn_third_party_kl' aliases
    assert "water_discharged_kl" in keys


async def test_excel_waste_sheet_extracts_categories(sample_xlsx_waste_bytes):
    result = await _run(sample_xlsx_waste_bytes, "waste.xlsx")
    keys = {rf.canonical_key for rf in result.raw_fields if rf.canonical_key}
    assert "waste_hazardous_kg" in keys
    assert "plastic_waste_kg" in keys
    assert "e_waste_kg" in keys
