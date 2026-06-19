# brsr-ai-engine — extraction pipeline

FastAPI service that turns uploaded documents into canonical metric values.
Achieves **98.8% F1 overall** and **99% cost reduction** on electricity bills via
deterministic DISCOM rule extractors that skip the LLM when confident.

## Stack
- FastAPI + Uvicorn
- OpenAI GPT-5 family (classifier=gpt-5-nano, extractor=gpt-5)
- pdfplumber + pypdf + Tesseract OCR
- Qdrant for RAG indexing
- Pydantic v2 with `extra="forbid"` request validation
- structlog for canonical logs

## Run

```bash
cd services/ai-engine
pip install -r requirements.txt
USE_LAYERED_PIPELINE=true \
OPENAI_API_KEY=sk-... \
QDRANT_URL=http://localhost:6333 \
REDIS_URL=redis://localhost:6379 \
S3_ENDPOINT=http://localhost:9000 \
S3_ACCESS_KEY=brsr-admin S3_SECRET_KEY=<minio_pw> \
BACKEND_CALLBACK_SECRET=<32-char-secret> \
uvicorn app.main:app --port 8100 --reload
# http://localhost:8100/docs
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | health + dependency checks |
| POST | `/extract` | sync or async (with `callback_url`) extraction |
| POST | `/classify` | doc-type classification only |
| GET | `/registry` | canonical metric registry dump |

## Pipeline (Layer 1 → 6)

```
ExtractRequest { file_id, tenant_id, s3_url, doc_type_hint, callback_url }
        ↓
   Layer 2: Layout detection (pdfplumber/OCR) — pages + text blocks
        ↓
   Layer 1: Classifier (gpt-5-nano) — doc_type + confidence
        ↓
   Layer 3: Table extraction — typed rows where structure detected
        ↓
   Layer 4: Vision/text extractor
            │
            ├─ Rule-first pre-pass:
            │     electricity_discom.py   (31 Indian DISCOMs incl. MSEDCL)
            │     water_bill.py           (multi-source)
            │     waste_manifest.py       (8 canonical waste keys)
            │     hr_headcount.py         (tight headcount-only)
            │
            └─ Fallback: gpt-5 with structured output schema
        ↓
   Layer 5: Mapping + dedup against canonical registry
        ↓
   Layer 6: Validation rules engine (40 rules, severity ERROR/WARNING)
        ↓
   Composite confidence scoring (6 components, geometric mean)
        ↓
   to_backend_callback_payload() → POST to API's /files/extraction-callback
```

### Confidence model (per field)

```
composite = geometric_mean(
    ocr_quality,         # 1.0 native PDF, ~0.7 OCR
    header_match,        # alias exact = 1.0, fuzzy = 0.7, semantic = 0.5
    unit_match,          # canonical unit matches = 1.0, compatible = 0.7
    cross_validation,    # agrees with siblings in same doc
    document_type_match, # metric category matches doc_type
    historical_consistency,  # z-score against prior values
)
```

Level mapping: HIGH ≥ 0.85, MEDIUM ≥ 0.65, LOW < 0.65.
Calibration: 100% accurate on HIGH (n=378) and MEDIUM (n=7) bands.

## Supported DISCOMs (electricity_discom.py)

| Region | DISCOMs |
|---|---|
| Gujarat | Adani, MGVCL, PGVCL, UGVCL, DGVCL, Torrent |
| Maharashtra | **MSEDCL** (Mahavitaran, Marathi), Tata Power, BEST, Reliance |
| Delhi | BSES Rajdhani, BSES Yamuna, TPDDL |
| Karnataka | BESCOM, MESCOM, HESCOM, GESCOM |
| Tamil Nadu | TANGEDCO/TNEB |
| AP / Telangana | APSPDCL, APEPDCL, APCPDCL, TSSPDCL, TSNPDCL |
| Kerala | KSEB |
| West Bengal | WBSEDCL, CESC |
| Punjab / Haryana | PSPCL, UHBVN, DHBVN |
| Rajasthan | JVVNL, AVVNL, JDVVNL |
| UP / MP / Odisha / Bihar | UPPCL, MPPKVVCL/MPMKVVCL, TPODL family, SBPDCL/NBPDCL |
| Chhattisgarh / Jharkhand / Uttarakhand | CSPDCL, JBVNL, UPCL |
| Generic | bilingual fallback (English / Marathi / Hindi / Tamil) |

## Tests

```bash
# 115-fixture regression
python -m tests.benchmark.runner

# Direct extractor test on a single fixture
python -c "
from app.extractors.electricity_discom import extract
text = open('tests/benchmark/fixtures/electricity_bills/adani_electricity_01.txt').read()
r = extract(text)
print(r.discom, r.overall_confidence)
for f in r.fields: print(f.metric_key, f.value, f.unit)
"

# Live pipeline test (requires services running)
python tests/run_pipeline.py path/to/document.pdf
```

## Debugging

```bash
# Tail logs
docker logs -f brsr-ai-engine

# What did the rule extractor do for a doc?
docker logs brsr-ai-engine | grep <file_id> | grep -E 'layer4|rule_extractor|llm.call|callback'

# Check OpenAI quota
docker exec brsr-ai-engine python -c "
from openai import OpenAI
import os
c = OpenAI(api_key=os.environ['OPENAI_API_KEY'])
r = c.chat.completions.create(model='gpt-5-nano',
    messages=[{'role':'user','content':'hi'}],
    max_completion_tokens=5)
print('OK', r.usage.total_tokens)
"
```

## Cost discipline

- **classifier (gpt-5-nano):** ~$0.0002/doc — runs on every upload
- **rule extractor (deterministic):** $0/doc — runs on every electricity bill, fires on 99% of them
- **Layer 4 LLM (gpt-5):** ~$0.014/doc — runs ONLY when rule extractor misses
- **Expected average cost** at production volume: $0.001-0.002/doc

See `app/llm/router.py` for per-model pricing table and per-call telemetry.
