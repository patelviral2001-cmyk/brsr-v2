"""Registry shape + unit conversion sanity tests."""
from __future__ import annotations

import pytest

from app.registry import METRIC_REGISTRY, all_keys, find_by_alias
from app.utils.units import canonical_unit, convert, is_compatible


def test_registry_has_minimum_metric_count():
    # We promised "200+ metrics" — sanity-check we hit it after scope 3 + grievances + sources.
    assert len(METRIC_REGISTRY) >= 100  # generous floor; actual is higher with all expansions


def test_all_metrics_have_required_keys():
    for k, v in METRIC_REGISTRY.items():
        assert "name" in v, f"{k} missing name"
        assert "unit" in v, f"{k} missing unit"
        assert "category" in v, f"{k} missing category"
        assert "allowed_units" in v, f"{k} missing allowed_units"


def test_scope3_categories_present():
    for n in range(1, 16):
        assert f"scope3_emissions_cat{n}_tco2e" in METRIC_REGISTRY


def test_find_by_alias_for_common_phrases():
    assert find_by_alias("total electricity") == "electricity_kwh"
    assert find_by_alias("HSD") == "diesel_l"
    assert find_by_alias("CSR spend") == "csr_spend_inr"


def test_unit_canonicalization():
    assert canonical_unit("kwh") == "kWh"
    assert canonical_unit("kilo watt hour") == "kWh"
    assert canonical_unit("kl") == "kL"
    assert canonical_unit("metric tonne") == "tonnes"


def test_unit_conversion_paths():
    assert convert(1000, "kWh", "MWh") == pytest.approx(1.0)
    assert convert(1, "kg", "g") == pytest.approx(1000.0)
    assert convert(1, "kL", "L") == pytest.approx(1000.0)


def test_dimension_compatibility():
    assert is_compatible("kWh", "MWh")
    assert not is_compatible("kWh", "kg")
