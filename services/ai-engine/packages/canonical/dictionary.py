"""Canonical Label Dictionary — alias → canonical label.

Different DISCOMs name the same concept differently ("Account No" / "ConsumerId"
/ "Service Number" / "CA Number" / "BP Number" / "IVRS"). The database never sees
raw labels; everything is resolved to a canonical label here.

This is DOCUMENT-FIELD synonymy, not ESG domain logic — safe to grow freely.
The dictionary is *data*: add aliases (incl. other languages) without code
changes. Unknown labels are returned as misses so the review queue / LLM fallback
can propose new aliases that an operator confirms into the seed.

Seed below was harvested from real bills: UPPCL/MVVNL/PVVNL (Hindi+English),
WBSEDCL, MPPKVVCL (MPEZ).
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

# section is the Universal Schema section the canonical label belongs to.
# kind drives downstream handling: "field" | "charge" | "flow" | "meter".
SEED: dict[str, dict] = {
    # ── consumer ──────────────────────────────────────────────────────────
    "account_number": {"section": "consumer", "kind": "field", "aliases": [
        "account no", "account number", "अकाउंट सं", "consumer no", "consumer id",
        "consumerid", "ca number", "bp number", "service number", "service no",
        "lt consumer number", "ivrs", "ca no",
        "ग्राहक क्रमांक", "ग्राहक क्र", "ग्राहक कमांक"]},     # Marathi: consumer number
    "consumer_name": {"section": "consumer", "kind": "field", "aliases": [
        "name", "नाम", "consumer name", "mr / ms", "mr/ms", "mr / ms."]},
    "tariff": {"section": "consumer", "kind": "field", "aliases": [
        "tariff", "टैिरफ", "tariff class", "tariff category"]},
    "sanctioned_load": {"section": "consumer", "kind": "field", "aliases": [
        "sanction load", "sanctioned load", "सवीकृ त भार", "connected load",
        "load sanctioned", "contract demand", "contracted load",
        "मंजुर भार", "मंजूर भार"]},                                  # Marathi
    "connection_date": {"section": "consumer", "kind": "field", "aliases": [
        "connection date", "संयोजन ितिथ"]},
    "security_deposit": {"section": "consumer", "kind": "field", "aliases": [
        "security deposit", "जमा पितभूित", "security amount deposited",
        "abps", "advance", "सुरक्षा ठेव", "सुरक्षा ठेव जमा"]},        # Marathi
    "connection_type": {"section": "consumer", "kind": "field", "aliases": [
        "connection type", "कनेकशन पकार", "supply type"]},
    "meter_number": {"section": "document", "kind": "field", "aliases": [
        "meter number", "मीटर संखया", "meter serial no", "meter no",
        "meter make & number", "मिटर क्रमांक", "मीटर क्रमांक"]},   # Marathi

    # ── utility ───────────────────────────────────────────────────────────
    "discom": {"section": "utility", "kind": "field", "aliases": [
        "discom", "licensee", "distribution company", "vidyut vitran nigam"]},
    "division": {"section": "utility", "kind": "field", "aliases": [
        "division", "खंड", "division name"]},
    "subdivision": {"section": "utility", "kind": "field", "aliases": [
        "subdivision", "उपखंड", "sub division"]},
    "gstin": {"section": "utility", "kind": "field", "aliases": [
        "gst no", "gstin", "gst number", "tan"]},

    # ── location ──────────────────────────────────────────────────────────
    "address": {"section": "location", "kind": "field", "aliases": [
        "address", "पता", "site at"]},
    "latitude": {"section": "location", "kind": "field", "aliases": ["latitude"]},
    "longitude": {"section": "location", "kind": "field", "aliases": ["longitude"]},

    # ── document ──────────────────────────────────────────────────────────
    "bill_number": {"section": "document", "kind": "field", "aliases": [
        "bill number", "िबल संखया", "invoice no", "invoice number", "bill no"]},
    "bill_basis": {"section": "document", "kind": "field", "aliases": [
        "bill basis", "िबल आधार", "reading type"]},

    # ── billing ───────────────────────────────────────────────────────────
    "bill_date": {"section": "billing", "kind": "field", "aliases": [
        "bill date", "िबल ितिथ", "billing date", "देयक दिनांक", "बिल दिनांक"]},
    "due_date": {"section": "billing", "kind": "field", "aliases": [
        "due date", "देय ितिथ", "bill payment last date", "देय दिनांक"]},
    "bill_month": {"section": "billing", "kind": "field", "aliases": [
        "bill month", "month", "माह", "billing month"]},
    "billing_period_start": {"section": "billing", "kind": "field", "aliases": [
        "prev read date", "previous read date"]},
    "billing_period_end": {"section": "billing", "kind": "field", "aliases": [
        "cur read date", "current read date", "current read date"]},
    "bill_amount": {"section": "billing", "kind": "field", "aliases": [
        "payable amount", "देय धनरािश", "bill amount", "current bill",
        "net amount", "amount payable", "total amount payable on due date",
        "total bill amount on due date", "amt due within due dt",
        "amount payable at a time", "(a) current payable amount",
        "current payable amount",
        "देयक रक्कम", "देयक रक्कम रु", "एकूण देय रक्कम", "देय रक्कम"]},  # Marathi
    "net_billed_unit": {"section": "billing", "kind": "field", "aliases": [
        "net billed unit", "नेट िबलड यूिनट"]},
    "consumption_kwh": {"section": "billing", "kind": "field", "aliases": [
        "units consumed", "unit consumed", "consumption", "billed units",
        "energy consumed", "meter units", "उपभोग", "एकूण वापर", "वापर"]},  # Marathi

    # ── power quality / demand ────────────────────────────────────────────
    "power_factor": {"section": "power_quality", "kind": "field", "aliases": [
        "power factor", "पावर फै कटर", "p.f.", "pf"]},
    "billed_demand": {"section": "power_quality", "kind": "field", "aliases": [
        "billed demand", "िबलड िडमांड", "bill demand"]},
    "maximum_demand": {"section": "power_quality", "kind": "field", "aliases": [
        "maximum demand", "max demand", "recorded demand", "दजर मांग"]},

    # ── renewable ─────────────────────────────────────────────────────────
    "solar_pv_capacity": {"section": "renewable", "kind": "field", "aliases": [
        "solar pv capacity", "solar capacity", "pv capacity"]},
}

# Charges: canonical code → aliases  (kind == "charge")
CHARGE_SEED: dict[str, list[str]] = {
    "energy_charge": ["energy charge", "energy charges", "उजारपभार", "ऊजारपभार",
                      "वीज आकार"],
    "demand_charge": ["demand charge", "demand charges", "मांग पभार",
                      "fixed/demand charge", "िफकसड/मांग पभार"],
    "fixed_charge": ["fixed charge", "िफकसड", "rental charge"],
    "electricity_duty": ["electricity duty", "िवदुत कर"],
    "fppa": ["fppa surcharge", "fppas charges", "fppa", "ईधन और िबजली अिधभार",
             "fuel and power purchase adjustment"],
    "lpsc": ["lpsc", "current lpsc", "previous lpsc", "late payment surcharge",
             "िवलमब भुगतान अिधभार", "lpsc charge", "due date late payment surcharge",
             "विलंब आकार", "विलंब आकार रु"],                              # Marathi
    "green_energy_charge": ["green energy charges", "गीन उजारशुलक"],
    "excess_demand_penalty": ["excess demand penalty", "अितिरक मांग पभार"],
    "minimum_charge": ["minimum charges", "नयूनतम पभार"],
    "metering_charge": ["metering charges", "meter charges"],
    "tax_cgst": ["cgst", "सी.जी.एस.टी"],
    "tax_sgst": ["sgst", "एस.जी.एस.टी"],
    "subsidy": ["subsidy by govt", "subsidy", "govt subsidy",
                "m.p.govt.subsidy amount", "सरकार दारा छू ट"],
    "arrear": ["arrear amount", "बकाया धनरािश", "principal arrear", "arrear"],
    "rebate": ["rebate", "छू ट", "timely payment rebate", "due date rebate",
               "other rebates"],
    "misc_charge": ["misc charges", "miscellaneous charges", "िविवध चाजेज",
                    "other charges", "adjustments"],
    "net_current_bill": ["net current bill", "नेट करेट िबल", "current month bill",
                         "sub total"],
}

# Energy-flow codes → aliases  (kind == "flow")
FLOW_SEED: dict[str, list[str]] = {
    "p2p_sold": ["p2p sold units", "पी2पी िवकय यूिनट"],
    "p2p_bought": ["p2p bought units", "पी2पी कय यूिनट"],
    "surplus_solar_opening": ["opening surplus solar units", "पारंिभक अिधशेष सौर यूिनट"],
    "surplus_solar_closing": ["closing surplus solar units", "अंितम अिधशेष सौर यूिनट"],
    "assessed_unit": ["assessed unit", "िनधारिरत यूिनट", "assessed units"],
}


def _norm(s: str) -> str:
    """Normalize a label for matching: NFKC, lowercase, strip punctuation/extra
    space. Script-agnostic — Devanagari passes through so Hindi aliases match."""
    if s is None:
        return ""
    s = unicodedata.normalize("NFKC", str(s))
    s = s.lower().strip()
    s = re.sub(r"[\(\)\[\]/:.\-—–,]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


@dataclass
class Resolution:
    canonical_label: Optional[str]
    section: Optional[str]
    kind: Optional[str]
    matched_alias: Optional[str]
    score: float                 # 1.0 exact alias, 0.6 contains, 0.0 miss


@dataclass
class CanonicalDictionary:
    """Growable resolver. Add aliases at runtime via `learn()`."""
    _index: dict[str, tuple[str, str, str]] = field(default_factory=dict)  # alias→(canon,section,kind)
    _unknown: dict[str, int] = field(default_factory=dict)

    @classmethod
    def from_seed(cls) -> "CanonicalDictionary":
        d = cls()
        for canon, meta in SEED.items():
            for a in meta["aliases"]:
                d._index[_norm(a)] = (canon, meta["section"], meta["kind"])
        for canon, aliases in CHARGE_SEED.items():
            for a in aliases:
                d._index[_norm(a)] = (canon, "charges", "charge")
        for canon, aliases in FLOW_SEED.items():
            for a in aliases:
                d._index[_norm(a)] = (canon, "energy_flow", "flow")
        return d

    def learn(self, alias: str, canonical_label: str, section: str, kind: str) -> None:
        self._index[_norm(alias)] = (canonical_label, section, kind)

    def resolve(self, raw_label: str) -> Resolution:
        n = _norm(raw_label)
        if not n:
            return Resolution(None, None, None, None, 0.0)
        # 1. exact alias
        if n in self._index:
            canon, section, kind = self._index[n]
            return Resolution(canon, section, kind, n, 1.0)
        # 2. containment either direction (handles "current lpsc" within a label).
        #    A unique multi-char alias appearing verbatim inside the printed label
        #    is a high-confidence match (0.85), not a guess.
        best: Optional[Resolution] = None
        for alias, (canon, section, kind) in self._index.items():
            if len(alias) >= 4 and (alias in n or n in alias):
                cand = Resolution(canon, section, kind, alias, 0.85)
                if best is None or len(alias) > len(best.matched_alias or ""):
                    best = cand
        if best:
            return best
        # 3. miss — record for review/learning
        self._unknown[n] = self._unknown.get(n, 0) + 1
        return Resolution(None, None, None, None, 0.0)

    def unknown_labels(self) -> dict[str, int]:
        return dict(self._unknown)
