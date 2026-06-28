"""Unit conversion graph — shared logic with the Node backend.

Implements a graph of unit-to-unit conversion factors per dimension
(energy, mass, volume, etc.). BFS finds shortest path between any two
compatible units. Provides aliases (case/space-insensitive) for messy
real-world inputs ('kilo-litres', 'KL', 'kilolitre').
"""
from __future__ import annotations

import re
from collections import deque
from dataclasses import dataclass, field
from typing import Iterable


@dataclass(frozen=True)
class UnitDef:
    canonical: str
    dimension: str  # energy, mass, volume, area, time, currency, dimensionless
    aliases: tuple[str, ...] = ()


# Edge: (from_unit, to_unit, multiplicative factor)
@dataclass
class UnitGraph:
    units: dict[str, UnitDef] = field(default_factory=dict)
    alias_to_canonical: dict[str, str] = field(default_factory=dict)
    edges: dict[str, dict[str, float]] = field(default_factory=dict)

    def add_unit(self, unit: UnitDef) -> None:
        self.units[unit.canonical] = unit
        self.alias_to_canonical[_norm(unit.canonical)] = unit.canonical
        for a in unit.aliases:
            self.alias_to_canonical[_norm(a)] = unit.canonical
        self.edges.setdefault(unit.canonical, {})

    def add_edge(self, frm: str, to: str, factor: float) -> None:
        """factor: 1 unit of `frm` equals `factor` units of `to`."""
        self.edges.setdefault(frm, {})[to] = factor
        self.edges.setdefault(to, {})[frm] = 1.0 / factor

    def canonicalize(self, raw: str) -> str | None:
        return self.alias_to_canonical.get(_norm(raw))

    def dimension_of(self, raw: str) -> str | None:
        canon = self.canonicalize(raw)
        if not canon:
            return None
        return self.units[canon].dimension

    def convert(self, value: float, frm: str, to: str) -> float | None:
        """BFS over the unit graph to compose conversion factors."""
        f = self.canonicalize(frm)
        t = self.canonicalize(to)
        if not f or not t:
            return None
        if f == t:
            return value
        if self.units[f].dimension != self.units[t].dimension:
            return None
        # BFS for shortest path
        q: deque[tuple[str, float]] = deque([(f, 1.0)])
        visited: set[str] = {f}
        while q:
            u, acc = q.popleft()
            for nxt, factor in self.edges.get(u, {}).items():
                if nxt in visited:
                    continue
                new_acc = acc * factor
                if nxt == t:
                    return value * new_acc
                visited.add(nxt)
                q.append((nxt, new_acc))
        return None


_NORM_RE = re.compile(r"[\s\-_/\.]+")


def _norm(s: str) -> str:
    return _NORM_RE.sub("", s.strip().lower())


def _build_default_graph() -> UnitGraph:
    g = UnitGraph()

    # Energy
    g.add_unit(UnitDef("kWh", "energy", ("kilowatthour", "kwh", "kw h", "kilo watt hour")))
    g.add_unit(UnitDef("MWh", "energy", ("megawatthour", "mwh", "mw h")))
    g.add_unit(UnitDef("GWh", "energy", ("gigawatthour", "gwh")))
    g.add_unit(UnitDef("GJ", "energy", ("gigajoule", "gigajoules")))
    g.add_unit(UnitDef("MJ", "energy", ("megajoule",)))
    g.add_unit(UnitDef("kJ", "energy", ("kilojoule",)))
    g.add_unit(UnitDef("TJ", "energy", ("terajoule",)))
    g.add_unit(UnitDef("kcal", "energy", ("kilocalorie", "kilo calorie")))
    g.add_edge("kWh", "MWh", 0.001)
    g.add_edge("MWh", "GWh", 0.001)
    g.add_edge("kWh", "MJ", 3.6)
    g.add_edge("MJ", "GJ", 0.001)
    g.add_edge("GJ", "TJ", 0.001)
    g.add_edge("kJ", "MJ", 0.001)
    g.add_edge("kcal", "kJ", 4.184)

    # Mass
    g.add_unit(UnitDef("kg", "mass", ("kilogram", "kilo", "kgs", "kilos", "kilograms")))
    g.add_unit(UnitDef("g", "mass", ("gram", "grams", "gm")))
    g.add_unit(UnitDef("tonnes", "mass", ("t", "ton", "tons", "metric ton", "metric tonne", "mt")))
    g.add_unit(UnitDef("lb", "mass", ("pound", "pounds", "lbs")))
    g.add_edge("kg", "g", 1000.0)
    g.add_edge("kg", "tonnes", 0.001)
    g.add_edge("lb", "kg", 0.45359237)

    # Volume
    g.add_unit(UnitDef("L", "volume", ("litre", "liter", "litres", "liters", "l")))
    g.add_unit(UnitDef("kL", "volume", ("kilolitre", "kiloliter", "kilolitres", "kl", "m3", "cubic metre", "cubic meter")))
    g.add_unit(UnitDef("mL", "volume", ("millilitre", "milliliter", "ml")))
    g.add_unit(UnitDef("ML", "volume", ("megalitre", "megaliter")))
    g.add_unit(UnitDef("scm", "volume", ("standard cubic metre", "nm3", "normal cubic metre")))
    g.add_edge("L", "kL", 0.001)
    g.add_edge("L", "mL", 1000.0)
    g.add_edge("kL", "ML", 0.001)

    # Currency (no FX, only aliasing)
    g.add_unit(UnitDef("INR", "currency", ("rs", "rupees", "rupee", "rs.", "inr", "₹")))
    g.add_unit(UnitDef("INR_lakh", "currency", ("lakh", "lakhs", "lac", "lacs")))
    g.add_unit(UnitDef("INR_crore", "currency", ("crore", "crores", "cr")))
    g.add_unit(UnitDef("USD", "currency", ("usd", "us$", "us dollar", "us dollars")))
    g.add_edge("INR", "INR_lakh", 0.00001)
    g.add_edge("INR_lakh", "INR_crore", 0.01)

    # GHG / Emissions
    g.add_unit(UnitDef("tCO2e", "emissions", ("t co2e", "metric tons co2e", "metric tonnes co2e", "tco2eq")))
    g.add_unit(UnitDef("kgCO2e", "emissions", ("kg co2e", "kilograms co2e")))
    g.add_edge("kgCO2e", "tCO2e", 0.001)

    # Dimensionless / percent
    g.add_unit(UnitDef("pct", "dimensionless", ("%", "percent", "percentage")))
    g.add_unit(UnitDef("count", "dimensionless", ("nos", "number", "numbers", "headcount", "persons")))
    g.add_unit(UnitDef("hours", "time", ("hr", "hrs", "hour")))
    g.add_unit(UnitDef("days", "time", ("day",)))
    g.add_unit(UnitDef("years", "time", ("year", "yr", "yrs")))
    g.add_edge("hours", "days", 1.0 / 24.0)
    g.add_edge("days", "years", 1.0 / 365.25)

    return g


UNIT_GRAPH = _build_default_graph()


def canonical_unit(raw: str | None) -> str | None:
    if raw is None:
        return None
    return UNIT_GRAPH.canonicalize(raw)


def convert(value: float, frm: str, to: str) -> float | None:
    return UNIT_GRAPH.convert(value, frm, to)


def is_compatible(frm: str, to: str) -> bool:
    df = UNIT_GRAPH.dimension_of(frm)
    dt = UNIT_GRAPH.dimension_of(to)
    return bool(df and dt and df == dt)


def parse_numeric(text: str) -> float | None:
    """Robustly parse a number from messy text. Strips commas, currency markers."""
    if text is None:
        return None
    s = text.strip().replace(",", "")
    s = re.sub(r"[^0-9.\-eE]", "", s)
    if s in ("", "-", ".", "-."):
        return None
    try:
        return float(s)
    except ValueError:
        return None
