# BRSR AI Platform — Security

This document describes the security posture: threat model, authn / authz, encryption, residency, secrets, audit, certifications, pen-test cadence, and incident response. It is the source of truth referenced by our Statement of Applicability (ISO 27001) and Trust Services Criteria (SOC 2).

Owner: CISO. Last reviewed 2026-06-16. Next review 2026-09-16.

---

## 1. Threat Model (STRIDE)

We threat-model per module and per data flow. Below is the consolidated platform-level model; per-feature models live in `docs/threat-models/`.

### 1.1 Spoofing

| Threat | Asset | Control |
| :--- | :--- | :--- |
| User credential theft | User session | MFA mandatory for TenantAdmin/Approver; WebAuthn preferred; SMS OTP fallback gated on risk score; session bound to UA + IP /24 |
| Service-to-service spoof | Internal API | Linkerd mTLS, SPIFFE identities; Kong validates JWT audience |
| Supplier magic-link replay | Supplier portal | One-time use, 30-day expiry, IP-binding for first activation, audit logged |
| Webhook source spoof | Inbound webhooks | HMAC-SHA256 with rotating secret; timestamp window 5 min; replay cache 10 min |
| AI-generated signature on report | Report artifact | Ed25519 over canonicalised PDF + XBRL; key in AWS CloudHSM for Listed Premium tier |

### 1.2 Tampering

| Threat | Asset | Control |
| :--- | :--- | :--- |
| Metric value alteration post-approval | metric_observations | Append-only revisions (`metric_observation_revisions`); audit_events hash chain |
| Evidence file substitution | S3 evidence-vault | Object Lock Compliance mode, 10y retention; SHA-256 verified on every download |
| Assurance snapshot tamper | Snapshot tar.gz | Merkle root signed; published to public bulletin; verifier tool ships in SDK |
| Container image tamper | EKS deploys | Cosign signing; admission controller (Kyverno) rejects unsigned images; SBOM in Trivy DB |
| Audit log tamper | audit_events | Hash chain (SHA-256 over prev_hash + payload); replicated WORM nightly; Ed25519-signed head |

### 1.3 Repudiation

| Threat | Asset | Control |
| :--- | :--- | :--- |
| User denies approving metric | Approval action | audit_events row with actor_id, IP, UA, ts, payload, hash; UI confirms with re-auth for sensitive actions |
| Board denies signing report | DocuSign envelope | Ed25519 sig over PDF hash; DocuSign envelope ID retained; certificate of completion stored in WORM |
| Auditor denies finding | assurance_finding | Hash-anchored to snapshot root |
| Supplier denies submission | supplier_submission | Token-auth with IP+UA capture; submission hash printed in confirmation email |

### 1.4 Information Disclosure

| Threat | Asset | Control |
| :--- | :--- | :--- |
| Cross-tenant data leak (RLS bypass) | All rows | RLS FORCE ROW LEVEL SECURITY; tenant interceptor sets GUC; integration tests assert reads of "other tenant" return 0 rows; Qdrant payload filter server-side; S3 IAM scoped by principal tag |
| Logs containing PII | Loki / Sentry | PII scrubber pipeline (regex + named entity recogniser); Sentry beforeSend filters |
| Browser XSS exfil | Web app | CSP `script-src 'self' 'nonce-…'`; Trusted Types; DOMPurify wrap for any HTML render; cookies HttpOnly + SameSite=Lax + Secure |
| LLM prompt-injection leaks | AI Engine | Sandwich pattern with structured-output schema; tool calls restricted by tenant scope; per-tool input validation; rejects responses that contain credentials regex |
| Public S3 bucket misconfig | S3 buckets | All buckets block-all-public-access; bucket policies deny `s3:PutBucketAcl`; Macie scans monthly |
| Customer data in dev / staging | All env | Synthetic data only in non-prod; production-data load is impossible by IAM separation; PRs that touch seed scripts require security review |

### 1.5 Denial of Service

| Threat | Asset | Control |
| :--- | :--- | :--- |
| Volumetric DDoS | Edge | AWS Shield Advanced; CloudFront in front; WAF rate rules |
| Application DoS | API | Kong rate limits per-tenant (600 req/min) and per-IP (60 req/min); Redis token-bucket |
| Costly LLM abuse | AI Engine | Per-tenant LLM cost ceiling (INR / hour); circuit breaker on cost > 95% of monthly budget; Anthropic spend caps |
| Storage bomb (zip / pdf) | Evidence upload | Content-type sniff; max file 200 MB; PDF page-count cap 800; ClamAV scan; AWS GuardDuty Malware Protection on S3 |
| Slow loris | ALB | Idle timeout 30 s; keep-alive bound; HTTP/2 with stream limits |
| Outbox flood | Kafka | Per-topic quota; consumer lag alarm; dead-letter topic with TTL |

### 1.6 Elevation of Privilege

| Threat | Asset | Control |
| :--- | :--- | :--- |
| Horizontal escalation (cross-tenant) | RLS | See 1.4 |
| Vertical escalation (role) | CASL | All ability checks server-side; client just hides UI; rule changes audited; principle of least privilege baked into JIT role grants |
| Container escape | EKS nodes | Bottlerocket OS; gVisor for ai-engine sandboxes; seccomp baseline profile; runAsNonRoot; readOnlyRootFilesystem true |
| K8s API abuse | Cluster | RBAC reviewed quarterly; no `cluster-admin` for humans except break-glass; sessions via aws-iam-authenticator with 4h TTL |
| CI secret leak | GitHub Actions | OIDC federation with AWS (no long-lived AWS keys); environment protection rules; required reviewers for prod env |

---

## 2. Authentication Flows

### 2.1 Standard SSO (OIDC Authorization Code + PKCE)

Detailed in [ARCHITECTURE.md, Section 7.1]. Summary:

- IdP: Keycloak (default) or customer's Okta / Azure AD / Google Workspace via OIDC federation.
- PKCE mandatory; nonce mandatory; state mandatory.
- Access token: JWT, 5 min TTL, audience = `api.brsrai.com`, signed RS256 with key rotated quarterly.
- Refresh token: 12 h TTL, rotation on use, revocable per session.
- Session cookie: opaque session id, server-side store in Redis with 30 min sliding + 12 h absolute timeout.

### 2.2 Step-up authentication

Triggered for: BRSR report lodging, board sign-off, metric re-statement, supplier mass-invite, role change to TenantAdmin, KMS key rotation.

```
[user action] -> [authz guard checks ability] -> [if mfa_recency > 5 min] -> 302 -> Keycloak `/login-actions/required-action?execution=CONFIGURE_TOTP&kc_action=update_password`
```

After successful step-up, the session is annotated `mfa_recency = now()` and the action proceeds.

### 2.3 Supplier magic-link

- Token: `[base64url(random 32 bytes)].[base64url(HMAC-SHA256(secret, supplier_id + exp))]`
- Stored as bcrypt(token) in `supplier_invitations.token_hash`.
- One-time use; on first activation, an account-scoped JWT (24 h) is issued for the supplier portal.
- IP binding: a window of /24 around first-use; differing /24s require email re-confirm.

### 2.4 Service-to-service

- Linkerd injects mTLS; SPIFFE identity `spiffe://brsr-ai-prod.svc/ns/<ns>/sa/<sa>`.
- Outbound HTTP calls between services additionally carry an OIDC token (issuer = internal Keycloak realm).
- Kong validates: identity matches namespace, audience matches target, scopes include the called endpoint.

### 2.5 CLI / CI

- Engineers use `aws sso login` then `kubectl` via aws-iam-authenticator.
- CI uses GitHub OIDC -> AWS STS AssumeRoleWithWebIdentity, no static keys.

---

## 3. Authorization Model — RBAC + ABAC

### 3.1 Roles

| Role | Scope | Typical user |
| :--- | :--- | :--- |
| GlobalAdmin | Platform-wide | BRSR AI staff (us) — admin console only, no tenant data |
| TenantAdmin | Per tenant | Customer Director of Sustainability or CIO designee |
| SustainabilityManager | Per tenant | Day-to-day ESG operator |
| Reviewer | Per facility (ABAC) | Plant-level deputy |
| Approver | Per metric kind (ABAC) | Senior reviewer |
| Auditor | Per assurance snapshot | External Big-4 partner |
| SupplierUser | Per supplier | External supplier representative |
| BoardMember | Per FY signature scope | Internal board member |
| ReadOnly | Tenant-wide read | Investor relations, internal audit |

### 3.2 Ability examples (CASL)

```typescript
// apps/api/src/iam/abilities.ts
defineAbility((user, can, cannot) => {
  // SustainabilityManager
  if (user.role === 'SustainabilityManager') {
    can('read', 'all');
    can('create', 'DataRequest');
    can('approve', 'MetricObservation', { confidence: { $gte: 0.95 } });
    cannot('approve', 'MetricObservation', { facility: { restricted: true } });
  }
  // Approver
  if (user.role === 'Approver') {
    can('approve', 'MetricObservation', {
      facilityId: { $in: user.attrs.facilityIds },
      status: 'pending'
    });
  }
  // Auditor (read-only on a snapshot)
  if (user.role === 'Auditor') {
    can('read', 'AssuranceSnapshot', { id: user.attrs.snapshotId });
    can('read', 'MetricObservation', { snapshotId: user.attrs.snapshotId });
    can('create', 'AssuranceFinding', { snapshotId: user.attrs.snapshotId });
    cannot('update', 'MetricObservation');
  }
  // Step-up gate
  if (user.action === 'reportLodge' && !user.mfaRecent) {
    cannot('lodge', 'Report'); // forces 401, FE triggers step-up
  }
});
```

### 3.3 Enforcement layers

1. **UI** hides actions for which `ability.cannot(...)`.
2. **API guard** runs CASL on every request; returns 403 with `WWW-Authenticate: Bearer error="insufficient_scope"`.
3. **Database** RLS prevents cross-tenant reads even if the application layer mis-routes.
4. **S3 IAM** session policies cap access to `s3:prefix/t/<tenantId>/`.
5. **Vault policies** scope KMS decrypt operations.

---

## 4. Encryption

### 4.1 In transit

| Where | Protocol | Cipher | Notes |
| :--- | :--- | :--- | :--- |
| CDN to user | TLS 1.3 (HSTS 2 y, includeSubDomains, preload) | TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256 | OCSP stapling on |
| ALB to pods | TLS 1.3 | as above | Cert rotated by ACM monthly |
| Pod to pod | mTLS via Linkerd | TLS 1.3, ECDHE-X25519-CHACHA20-POLY1305 | Identity certs rotated every 24 h |
| Egress to Anthropic | TLS 1.3 with cert pinning | as above | Pinned to Anthropic's issuer CA |
| Egress to Voyage / Qdrant Cloud | TLS 1.3 | as above | Pin pending vendor support |
| Internal mgmt (kubectl etc.) | TLS 1.3 + SSO | as above | aws-iam-authenticator, no kubeconfig with embedded creds |

### 4.2 At rest

| Where | Algo | Key custody | Rotation |
| :--- | :--- | :--- | :--- |
| Aurora storage | AES-256 (RDS default) | AWS KMS CMK per tenant tier; BYOK option for Listed Premium | CMK 12 months |
| Aurora backups | AES-256 | Separate KMS CMK | 12 months |
| S3 evidence-vault | SSE-KMS + bucket-key-enabled | CMK per tier; BYOK; cross-region replica re-encrypted | 12 months |
| S3 reports / backups | SSE-KMS | CMK | 12 months |
| Qdrant disk (EBS) | AES-256 EBS | KMS | 12 months |
| OpenSearch | AES-256 | KMS | 12 months |
| Redis | AES-256 (in-transit + at-rest) | KMS | 12 months |
| Kafka topics | AES-256 | MSK KMS | 12 months |
| Vault storage backend | AES-256 (Vault Transit) | Vault root, sealed by KMS | 90 days |

### 4.3 Field-level (application layer)

PII columns are encrypted application-side via Vault Transit before reaching Postgres. Keys (per tenant) are rotated quarterly. Implementation: `PrismaPiiExtension` intercepts marked fields (`@pii` decorator on Prisma model) and wraps `encrypt` / `decrypt` calls.

```typescript
// packages/shared/prisma/pii.ts
const piiExtension = Prisma.defineExtension({
  query: {
    user: {
      async create({ args, query }) {
        if (args.data?.email) {
          args.data.email = await vault.transit.encrypt('tenant-' + ctx.tenantId, args.data.email);
        }
        return query(args);
      },
      // ...findUnique, update, etc.
    }
  }
});
```

Deterministic encryption is used only for fields that need equality search (e.g. `email_search_token`); the search token is HMAC-SHA256 with a per-tenant key separate from the encryption key.

### 4.4 Key custody for the highest tier

For Listed Premium customers (banks, PSUs), we offer:

- Customer-managed CMKs in their AWS account, cross-account grants to our roles, revocable at any time (revoking effectively shuts off access).
- BYOK via KMS Import Token (RSA-2048-wrap).
- Optional CloudHSM-backed root for the Ed25519 signing key on report artifacts.

---

## 5. Data Residency

| Tier | Region default | Other regions available |
| :--- | :--- | :--- |
| Pool / Compliance | ap-south-1 (Mumbai) | n/a (pool is single-region) |
| Enterprise / Silo | ap-south-1 | ap-south-2 (Hyderabad) on request |
| Group | ap-south-1 | ap-south-1 + ap-south-2 active-passive |
| Listed Premium | configurable | any AWS region the customer requests; we operationally support ap-south-1, ap-south-2, ap-southeast-1, eu-west-1 |

DPDPA-compliant: by default all customer data lives in India and is processed in India. Cross-border processing (for EU customers using EU-region) is contractually opt-in.

For Anthropic LLM calls: traffic egresses to Anthropic's US endpoint by default. Customers may opt for the Amazon Bedrock equivalent in ap-south-1 once the corresponding model SKUs are GA — wired through a single `LLM_BACKEND` env var per tenant.

---

## 6. Secrets Management

- **Source of truth**: HashiCorp Vault (self-hosted, HA, integrated storage Raft) within our EKS cluster.
- **Sync to workloads**: external-secrets operator pulls into K8s secrets at deploy time; secrets mount as files (no env vars for high-sensitivity).
- **Application access**: services authenticate to Vault via Kubernetes auth backend, get short-lived tokens (1 h), scoped to per-service policies.
- **Bootstrap**: AWS Secrets Manager holds Vault unseal keys, split via Shamir 5-of-3, rotated annually; unseal automated via auto-unseal with KMS.
- **Rotation policy**:
  - Service account tokens: 1 h.
  - DB passwords (dynamic): 24 h.
  - API keys (Anthropic, Voyage): 90 days (manual rotation, alarmed at 80 days).
  - TLS certs (ACM, Linkerd): automatic.
  - Signing keys (Ed25519 report signer): annually.
  - JWT signer (RS256): quarterly with overlap window.
- **No secrets in code, ever**: pre-commit hook (gitleaks); CI runs trufflehog; GitHub secret scanning enabled.

---

## 7. Audit Logging and Hash Chain

Schema and chain mechanics covered in [ARCHITECTURE.md, Section 7.4]. Operational notes:

- Every API write produces an `audit_event` row in the same transaction (transactional outbox).
- A continuous job (Temporal-driven, 5-minute interval) computes `hash` for new rows in order.
- A daily snapshot of the chain is exported to `s3://brsr-evidence-vault-prod/audit-chain/<date>/` with Object Lock Compliance mode, 10-year retention.
- The head hash is signed nightly with an Ed25519 key stored in CloudHSM; the signature is posted to:
  - a public bulletin URL `https://chain.brsrai.com/<tenantId>/<date>`,
  - optionally to a 3rd-party notary (e.g. OriginStamp) for Listed Premium tier.
- A verifier CLI (`brsr verify-chain --tenant=<id> --range=2026-04-01..2026-06-30`) is published as part of the SDK so auditors can independently verify chain integrity.

Retention: 10 years minimum; longer if customer's industry regulator requires it.

---

## 8. Compliance Roadmap

| Target | Status | ETA |
| :--- | :--- | :--- |
| ISO/IEC 27001:2022 | Drafting SoA; pre-audit Q1 2027 | Q2 2027 cert |
| SOC 2 Type II | Drata onboarded; six-month observation window starting Q2 2027 | Q4 2027 attestation |
| DPDPA (India) | Compliant day 1; DPO appointed | done |
| GDPR (for EU customers) | DPA, SCCs, DPIA in place | done |
| HIPAA | Not applicable (no PHI) | — |
| RBI Master Direction on Outsourcing | Compliant for FI customers (Listed Premium tier only) | done |
| IRDAI guidelines | Compliant for insurer customers | done |
| ISO/IEC 27701 (PIMS) | After 27001 | Q4 2027 |
| ISO 22301 (BCMS) | Aligned, not certified | TBD |

Audit-readiness work (penetration tests, evidence, policies) is tracked in `compliance/` (private repo).

---

## 9. Penetration Testing Schedule

| Test | Cadence | Vendor |
| :--- | :--- | :--- |
| External infra pentest | Annually | Rotating among 2 SEBI-empaneled firms |
| Web app pentest (OWASP) | Annually | Cobalt Strike Pro engagement |
| API pentest | Annually | Same as above |
| LLM red-team (prompt injection, jailbreak, data-exfil via tools) | Quarterly | Internal red team + 1 external review/year |
| Cloud config (CSPM) | Continuous (Wiz / Prowler) | self |
| Phishing simulation | Quarterly | KnowBe4 |
| Tabletop incident exercise | Semi-annually | self + DR vendor |
| Bug bounty (private) | Always-on | HackerOne private program |

Critical and High findings: SLA 7 days to remediate; Medium: 30 days; Low: 90 days; Informational: at-discretion. All findings logged in our risk register.

---

## 10. Incident Response Playbook (outline)

We follow NIST 800-61 r2. Roles and on-call rotations are in PagerDuty; runbooks live in `runbooks/`. Below is the outline; full playbook is internal.

### 10.1 Detect

- 24/7 PagerDuty rotation; primary, secondary, CISO escalation.
- Triggers: Prometheus alert (SEV-1 alert routes to phone), Sentry SLO breach, GuardDuty High finding, Wiz Critical, Cilium IDS, customer ticket flagged "security".

### 10.2 Triage (within 15 min of detection)

- Open incident in Statuspage as "investigating"; create war-room channel.
- Determine SEV: SEV-1 (data breach / outage), SEV-2 (degradation), SEV-3 (single-tenant impact), SEV-4 (info).
- Page CISO for any SEV-1 or any suspected confidentiality breach.

### 10.3 Contain (SEV-1 target: 60 min)

- Pre-built containment actions:
  - Block IP / IP range at WAF.
  - Disable user / API key / supplier token.
  - Cordon affected K8s node; drain.
  - Rotate compromised secret (Vault auto-revoke).
  - Freeze writes for affected tenant (feature flag).
- If suspected compromise, take forensic snapshot of EBS / EKS pod filesystem.

### 10.4 Eradicate

- Patch root cause; deploy via emergency change process (CAB approval async).
- Verify integrity of audit chain (re-run hash from last verified head).
- Rebuild compromised infra from known-good IaC.

### 10.5 Recover

- Lift containment after 2 successive verification windows.
- Restore service to full capacity; remove "investigating" status.
- Customer comms: targeted notification to affected tenants within 72 h (DPDPA requirement) and to regulators where required.

### 10.6 Post-mortem

- Blameless within 5 business days; published internally; redacted version to affected customers.
- Action items tracked to closure in our risk register; engineering owner assigned.

### 10.7 Breach notification

- DPDPA Schedule II: notify Data Protection Board of India within 72 hours of awareness; affected data principals "as soon as possible".
- GDPR (if EU data): 72 h to supervisory authority.
- Customer contracts: 48 h to notify customer's designated security contact.

---

## 11. Backup and Recovery (security view)

See [ARCHITECTURE.md, Section 10] for operational details. Security-relevant:

- Backups encrypted with a separate KMS CMK from production.
- Backups stored in a separate AWS account (`brsr-ai-backup`) with no cross-account permissions to production-account principals — only break-glass roles can read.
- Restore drills quarterly; drill restores include verifying audit-chain head against the published bulletin.

---

## 12. Vendor and Sub-processor Management

- Annual due diligence on every sub-processor (SOC 2, ISO 27001 evidence required).
- Sub-processor register published at `https://brsrai.com/legal/sub-processors`; 30-day prior notice for changes.
- Critical sub-processors today: AWS, Anthropic, Voyage AI, DocuSign, Amazon SES, PagerDuty.

---

## 13. Secure Development Lifecycle

- Threat modelling required for any change introducing a new data flow (ADR template includes a STRIDE section).
- Two reviewers minimum; one must be a CODEOWNER for the touched module.
- SAST in CI (Semgrep + Bandit + ESLint security plugin); blocks merge on Critical findings.
- SCA in CI (Trivy + Snyk); blocks merge on High vulns with patched versions available.
- Container scanning post-build; signed with Cosign; admission controller verifies.
- IaC scan (Checkov) for Terraform; blocks merge on Critical.
- Production deploys require: green CI, signed image, ArgoCD sync approval from 1 SRE.
- Break-glass production access: requires Slack approval from 2 people not on the same team, time-boxed 1 h, recorded session.

