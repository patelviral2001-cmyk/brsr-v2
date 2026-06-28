# Contributing to BRSR AI Platform

We use trunk-based development with short-lived feature branches and required PR reviews. Read this end-to-end before your first PR.

---

## Code Style

### TypeScript / JavaScript

- **Formatter**: Prettier 3.4 with the repo's `.prettierrc`. Use 2-space indent, single quotes, trailing commas. Run `pnpm format` before committing; pre-commit hook (`lint-staged`) does it for you.
- **Linter**: ESLint 9 (flat config) with `@typescript-eslint`, `eslint-plugin-import`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-security`. Errors block CI.
- **Naming**: PascalCase for types/components, camelCase for functions/vars, SCREAMING_SNAKE_CASE for constants, kebab-case for filenames except React components which match their default export.
- **Imports**: grouped (node, external, internal, sibling, parent) with newline separators; `simple-import-sort` enforces ordering.
- **Promises**: never floating; always `await` or `.catch()`; ESLint `no-floating-promises` is `error`.
- **Errors**: never `throw 'string'`; subclass `BaseError` from `packages/shared/errors`.
- **Comments**: explain why, not what. Use TSDoc for public APIs.

### Python

- **Formatter + Linter**: Ruff 0.8 (single tool, replaces Black + isort + flake8). Config in `pyproject.toml`. Target Python 3.12. Line length 100.
- **Types**: mypy 1.13, strict on. All public functions must be typed. No `Any` without a comment justifying it.
- **Naming**: PEP 8 strict. Module names `snake_case`. Constants `UPPER_SNAKE`.
- **Async**: prefer `asyncio` and `httpx`; never mix sync `requests` into async paths.
- **Errors**: subclass `BrsrError`; include `context` dict for structured logging.

### SQL

- Lowercase keywords (`select`, `from`); `snake_case` identifiers; `pg_format` formatter.
- Migrations are immutable once shipped; never edit; always add a new migration.

### Terraform

- HCL formatter (`terraform fmt -recursive`).
- Tflint + Checkov in CI.
- Module per logical concern (vpc, eks, rds...); no module > 400 lines.

---

## Branch Strategy

Trunk-based, short-lived feature branches.

- `main` is the trunk. Always green. Always deployable.
- Feature branches: `<initials>/<scope>-<one-line-desc>`, e.g. `sn/extraction-judge-prompt-v3`.
- Branch lifetime: ideally < 3 days; absolute max 7 days (longer means break the work into smaller PRs).
- Rebase, do not merge `main` into your branch. We `pull --rebase` and force-push to feature branches.
- Release tags: `v<MAJOR>.<MINOR>.<PATCH>`; SemVer; release notes generated from Conventional Commits.

---

## Pull Requests

### PR template

```markdown
## What and Why

(1-3 sentences. Why does this exist? What problem does it solve?)

## How

(Brief description of the approach. Link any ADR.)

## Screenshots / Demos

(Required for UI changes. Before/after if it's a redesign.)

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated (if cross-module)
- [ ] E2E tests added/updated (if user-facing flow)
- [ ] Manual test plan executed (paste output)

## Security

- [ ] No secrets in code
- [ ] New permissions added/changed (list)
- [ ] Touches PII handling (yes/no — if yes, security review tagged)
- [ ] Touches multi-tenant isolation (yes/no — if yes, RLS test added)

## Migration

- [ ] DB migrations are forward-only and backward-compatible across one release
- [ ] No backfill > 5 minutes (use a separate migration script)

## Rollout

- [ ] Behind a feature flag (name: ____) or low-risk
- [ ] Observability metrics added/sufficient
- [ ] Runbook updated (if operational change)

## Risks

(What could go wrong? What is the blast radius?)
```

### Required checks

1. CI green: lint, typecheck, unit tests, build, security scans.
2. One CODEOWNER review (two for security-tagged PRs and for migrations).
3. PR description complete (all template sections filled).
4. PR < 400 lines diff (excluding tests, generated code, lockfiles). Larger PRs need a "big PR" tag and an explanation.
5. Conventional commit title: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`, `perf:`, `build:`, `ci:`, `revert:`. Scope optional: `feat(api): add /reports endpoint`.

### Review etiquette

- Reviewer responds within 1 business day.
- Author rebases and force-pushes; no scary "I rebased and the reviewer's comments disappeared" — we use GitHub's review-thread persistence across force pushes.
- Use the convention `nit:`, `question:`, `blocking:` on review comments to set expectations.
- Pairing > PR review for complex changes — schedule a 30-min sync if you sense > 2 round-trips coming.

---

## Testing Requirements

| Layer | Tool | Coverage target | When required |
| :--- | :--- | ---: | :--- |
| TS / Node unit | Vitest 2.1 | 80% line / 75% branch | always; PR fails below the floor |
| Python unit | pytest 8.3 | 80% line | always |
| API integration | Vitest + Testcontainers (Postgres, Redis) | n/a | for any controller/service touched |
| AI agents | LangSmith + golden datasets | n/a | regression check on prompt/agent changes |
| Frontend component | Vitest + @testing-library/react | 75% line | for shared components in `packages/ui` |
| E2E | Playwright 1.49 | n/a | for user-facing flow changes (label: `e2e`) |
| Load | k6 0.55 | n/a | quarterly; ad-hoc before scale events |
| Security | Snyk + Semgrep + Trivy | n/a | every PR |

### Golden datasets for the AI engine

- `apps/ai-engine/tests/golden/<task>/` holds N labelled docs per metric family.
- A prompt or model change must show metrics improve or hold on the golden set; CI runs the eval and posts diff on the PR.
- Net regression is a blocking review even if no unit test fails.

---

## Database Migrations

We use Prisma Migrate for the schema and Liquibase for operational changes (e.g. index rollouts across millions of rows).

- One migration per PR (preferably).
- Migrations must be:
  - **Forward-only**. Never edit a shipped migration; always add a new one.
  - **Backward-compatible** with the previous app version (`v-1`). This means: add a column with default; backfill in a separate script; drop later.
  - **Fast**. Anything that locks a table for > 100 ms must use `CREATE INDEX CONCURRENTLY`, `ALTER TABLE ... NOT VALID + VALIDATE`, or a separate online rollout.
- The migration CI workflow (`.github/workflows/prisma-migrate.yml`) runs `prisma migrate diff` and posts the SQL to the PR. Migrations against prod require a manual approval and run within a maintenance window for any DDL > 1 second.

---

## Documentation

- Public API surface: TSDoc / Python docstrings.
- Architectural decisions: ADRs in `docs/adr/NNNN-title.md`. New ADR opens a discussion thread; merged with the PR that implements it.
- Runbooks: `runbooks/<service>/<scenario>.md` mandatory for any new on-call alert.
- Update `CHANGELOG.md` (root) for any user-facing change.

---

## Release Process

We release weekly to production. Hotfixes anytime.

1. **Cut a release branch** on Thursday afternoon: `release/v<MAJOR>.<MINOR>.<PATCH>`.
2. **Smoke test on staging**: ArgoCD auto-sync to staging on the release branch; smoke + E2E suite must pass.
3. **Manual approval** in GitHub Actions for `deploy-prod.yml`: one of (SRE lead, VP Eng, on-call SRE).
4. **Canary**: 10% of pods get the new image first; monitor SLOs for 30 min.
5. **Full rollout**: ArgoCD progressive sync the rest.
6. **Tag**: `git tag v<MAJOR>.<MINOR>.<PATCH>`; release notes auto-generated by `release-please` from Conventional Commits since the last tag.
7. **Post-release**: SRE on-call monitors error budget for the next 24 h; PR author available in the release channel.

### Hotfix process

- Branch from the latest released tag.
- Single-purpose change; tests must pass.
- Same review and approval rules.
- Cherry-picked to `main` immediately after deploy.

---

## Local Development Workflow

```bash
# clone and bootstrap
git clone https://github.com/your-org/brsr-v2.git
cd brsr-v2
corepack enable

# generate local secrets
./infra/scripts/generate-secrets.sh

# bring up infra
docker compose -f infra/docker-compose.dev.yml up -d

# install + migrate + seed
pnpm install
pnpm db:migrate
pnpm db:seed

# run everything
pnpm dev
```

Pre-commit hooks installed via `simple-git-hooks`:
- `lint-staged` runs Prettier and ESLint on staged files
- `gitleaks` scans for secrets

If a hook blocks you and you genuinely need to bypass (rare), use `git commit --no-verify` and explain in the PR description.

---

## Code Of Conduct

We follow the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct.html). Be excellent to each other.

Security disclosures: see `SECURITY.md` for our responsible-disclosure policy. Do not file public issues for security bugs; email `security@brsrai.com` (PGP fingerprint in `SECURITY.md`).

---

## Getting help

- `#eng-help` in Slack for engineering questions
- `#product` for product questions
- `#design` for design system questions
- `#security` for security questions (private to security team)
- `#oncall-prod` to follow live incidents

Welcome aboard.
