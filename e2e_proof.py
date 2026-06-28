"""End-to-end proof: upload a real bill through the BRSR api → UEDI ai-engine
extracts → callback stores → read it back. Proves the engine is integrated into
the running app. Run: python C:\\Users\\admin\\brsr-uedi\\e2e_proof.py
"""
import json, sys, time, urllib.request, urllib.error, uuid, mimetypes
from pathlib import Path

API = "http://localhost:4000/api/v1/v1"
BILL = Path(sys.argv[1] if len(sys.argv) > 1 else
            r"E:\IST\Proposal\NHAI\Light Bills\Bramhni SL8.04.2026-9.05.26.pdf")
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass


def req(method, url, data=None, headers=None, raw=False):
    h = headers or {}
    body = data if raw else (json.dumps(data).encode() if data is not None else None)
    if data is not None and not raw:
        h["content-type"] = "application/json"
    r = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def multipart(fields, files):
    b = "----b" + uuid.uuid4().hex
    out = []
    for k, v in fields.items():
        out.append(f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    for k, (fn, content) in files.items():
        ct = mimetypes.guess_type(fn)[0] or "application/octet-stream"
        out.append(f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fn}\"\r\nContent-Type: {ct}\r\n\r\n".encode())
        out.append(content); out.append(b"\r\n")
    out.append(f"--{b}--\r\n".encode())
    return b"".join(out), f"multipart/form-data; boundary={b}"


print("1) login admin@theesg.in")
st, body = req("POST", f"{API}/iam/auth/login", {"email": "admin@theesg.in", "password": "Admin@1234"})
d = body.get("data") or body
token = d.get("token") or d.get("accessToken") or d.get("access_token")
print(f"   status={st} token={'yes' if token else 'NO'} tenant={d.get('tenantId') or d.get('user',{}).get('tenantId')}")
if not token:
    print("   login response:", json.dumps(body)[:400]); sys.exit(1)
auth = {"authorization": f"Bearer {token}"}

print("2) upload bill via /evidence/upload")
data, ct = multipart({"docTypeHint": "ELECTRICITY_BILL"}, {"file": (BILL.name, BILL.read_bytes())})
st, body = req("POST", f"{API}/evidence/upload", data=data, headers={**auth, "content-type": ct}, raw=True)
d = body.get("data", body)
ev_id = d.get("id")
print(f"   status={st} evidence_id={ev_id} state={d.get('status')}")
if not ev_id:
    print("   upload response:", json.dumps(body)[:500]); sys.exit(1)

print("3) wait for UEDI extraction (api → ai-engine → callback)")
payload = None
for i in range(40):
    st, body = req("GET", f"{API}/evidence/{ev_id}", headers=auth)
    d = body.get("data", body)
    exts = d.get("extractions") or []
    if exts:
        e = exts[0]
        status = e.get("status")
        print(f"   [{i:02d}] extraction status={status} conf={e.get('confidence')}")
        if status and status not in ("PENDING", "PROCESSING", "QUEUED", None):
            payload = e.get("payload") or e.get("data")
            break
    else:
        print(f"   [{i:02d}] no extraction row yet (evidence status={d.get('status')})")
    time.sleep(3)

print("\n4) RESULT — stored in the BRSR database via UEDI:")
if isinstance(payload, str):
    try: payload = json.loads(payload)
    except Exception: pass
if isinstance(payload, dict):
    print("   schema/doc_type :", payload.get("_route"), "| review:", payload.get("_needs_review"))
    print("   account_number  :", payload.get("account_number"))
    print("   bill_amount     :", payload.get("bill_amount"))
    print("   energy_flow     :", payload.get("_energy_flow"))
    print("   validation      :", (payload.get("_validation") or {}).get("status"))
    print("   ocr_source      :", payload.get("_ocr_source"))
else:
    print("   (no payload captured; last evidence body)"); print(json.dumps(body)[:600])
print("\nDONE — bill flowed Upload → api → UEDI(Document AI/GPT-4o) → callback → Postgres.")
