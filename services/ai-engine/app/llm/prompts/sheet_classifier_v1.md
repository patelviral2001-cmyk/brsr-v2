# Spreadsheet Sheet Classifier — v1

You are given the **first 5 rows** of a worksheet (plus the sheet name) and must
classify it as one of:

- `HR` — employee master or payroll
- `FUEL` — fuel consumption log
- `WATER` — water withdrawal / discharge
- `WASTE` — waste manifest
- `FINANCIAL` — financial statements / register
- `GHG` — emissions log
- `EHS` — incident/audit log
- `GENERIC` — none of the above

Return **ONLY** valid JSON matching the provided schema — no markdown, no prose:

```json
{"sheet_type": "HR", "confidence": 0.0, "rationale": "≤ 120 chars"}
```
