# Phase 1.5 Ground Truth — 12 Real MSEDCL Bills

All 12 bills are real Mahavitaran (MSEDCL) bills for **National Highways Infra Projects Pvt Ltd**
across Wardha/Nagpur districts, Maharashtra. Most are LT (street lighting); 4 are HT/LTIP.
Field names below match the `ElectricityBillV1` Pydantic schema in `services/ai-engine/app/schemas.py`.

When the bills are re-uploaded through the live app, the extracted values must match this table.
Allow ±1 day on dates, exact match on consumer_number, ±0% on numeric units.

| # | File | Type | consumer_number | provider | bill_amount_inr | units_kwh | period_start | period_end | contract_demand_kva | sanctioned_load_kw |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Ajanti Street Lights.pdf | LT | 396741101972 | MSEDCL | 3380.00 | 80 | 2025-07-24 | 2025-08-22 | — | 0.96 |
| 2 | Barbadi Street Lights.pdf | LT | 397180006335 | MSEDCL | 2610.00 | 56 | 2025-07-20 | 2025-08-19 | — | 2.0 |
| 3 | Bramhni Street Light.pdf | LT | 411340003306 | MSEDCL | 640.00 | 56 (31 + 25 adj) | 2025-08-08 | 2025-09-09 | — | 1.0 |
| 4 | Chimanazari Street Light.pdf | LT | 911420001242 | MSEDCL | 1300.00 | 114 (52 + 62 adj) | 2025-08-08 | 2025-09-09 | — | 2.0 |
| 5 | Daroda Bus Stop Street Light.pdf | LT (FAULTY meter, est.) | 396051001053 | MSEDCL | 5690.00 | 384 (estimated) | 2025-08-05 | 2025-09-05 | — | 3.0 |
| 6 | Daroda Street Light.pdf | LT | 396051001029 | MSEDCL | 6430.00 | 440 | 2025-08-08 | 2025-09-08 | — | 10.0 |
| 7 | Daroda Toll Plaza.pdf | **HT/LTIP** | 396050002331 | MSEDCL | 216010.00 | 11459 (kWh, TOD) | 2025-07-31 | 2025-08-31 | 84.0 | 75.0 |
| 8 | Ghatsavli Street Light.pdf | LT | 396541001744 | MSEDCL | 4570.00 | 299 | 2025-08-05 | 2025-09-05 | — | 5.0 |
| 9 | Haladgaon Fata Street Lights.pdf | LT | 398270001371 | MSEDCL | 1470.00 | 7 | 2025-07-21 | 2025-08-20 | — | 1.08 |
| 10 | Hinganghat Street Light.pdf | **HT/LTIP** | 396015205904 | MSEDCL | 220340.00 | 11459 (kWh, TOD) | 2025-07-31 | 2025-08-31 | 50.0 | 40.0 |
| 11 | Jam Street Light.pdf | **HT/LTIP** | 396060007595 | MSEDCL | 135650.00 | 7460 (kWh, TOD) | 2025-08-03 | 2025-09-03 | 14.0 | 40.0 |
| 12 | Jamb Street Lights.pdf | LT | 396061011014 | MSEDCL | 17010.00 | 649 | 2025-07-18 | 2025-08-17 | — | 12.78 |

## Edge cases the LLM must handle correctly

- **Marathi/Devanagari mixed with English** — every bill has महाराष्ट्र, मागील रिडिंग, etc.
- **Two amounts on same bill** — "if paid upto 22-SEP" vs "if paid after". Extract the base bill_amount, not the discount or late-fee amount.
- **FAULTY meter (bill #5)** — chalu reading "उपलब्ध नाही" (unavailable). Extraction must still emit units (estimated value).
- **TOD bills (#7, #10, #11)** — multiple TOD slot tables. units_consumed_kwh should be the kWh consumption total, not RKVAH or KVAH.
- **Adjustments (#3, #4)** — "समा. यूनिट" adjustment column changes the EKAN (total). Use EKAN as units, not raw difference.
- **HT vs LT classification** — HT bills have CONTRACT DEMAND and TOD breakdowns; LT bills have a simple chalu/magil/units row. Classifier should still tag both as `ELECTRICITY_BILL_V1`.

## How to use this table

After deploy → upload each PDF via UI → Evidence Review screen shows extracted fields.
Compare side-by-side with this table. Record mismatches under three buckets:
- **Wrong** (LLM extracted a different value)
- **Missing** (LLM returned null when ground truth has a value)
- **Hallucinated** (LLM emitted a value not in the bill)

Target: ≥ 80% field-level accuracy on this corpus before customer pilot. Reviewer should
*verify*, not *re-enter*.
