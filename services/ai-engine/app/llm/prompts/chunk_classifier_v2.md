# Chunk Metric Classifier — v2

Given a chunk of text from a business document, identify which of the candidate
metric keys are **likely** present. This is a cheap pre-pass so we only invoke
the (expensive) entity extractor for plausible metric/chunk pairs.

## Inputs
- `chunk_text`
- `candidate_metrics`: a list of `{canonical_key, name, aliases}` entries.

## Output
Return **ONLY** valid JSON matching the provided schema — no markdown, no prose:

```json
{
  "predicted_keys": ["electricity_kwh", "diesel_l"],
  "rationale": "short note"
}
```

## Rules
- Be **inclusive**. Better to over-predict than to miss a value.
- Predict only keys from the provided `candidate_metrics`.
- If the chunk is structural (headings, page numbers, ToC), return an empty list.
