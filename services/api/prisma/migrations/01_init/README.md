# 01_init — BRSR v2 initial schema

This is the first Prisma migration. It establishes the entire schema
plus the production-grade Postgres machinery that Prisma can't model
on its own: extensions, ltree, RLS policies, the audit-log hash chain,
and the supporting partial / composite indexes.

## Migration order

Prisma applies migration directories in lexicographic order:

```
01_init/migration.sql       <-- this file
02_partitions/migration.sql <-- adds declarative partitioning (deferred)
03_…
```

The `migration.sql` in this directory is structured so that the
CREATE TABLE statements Prisma auto-generates from `schema.prisma`
run first, and the post-table customizations (extensions, RLS,
triggers, type promotions) run after. When you run
`pnpm prisma:migrate:dev`, Prisma will produce a combined SQL file
that begins with the generated DDL and ends with the contents below.

## Sections in `migration.sql`

1. **Extensions** — `pgcrypto`, `ltree`, `pg_trgm`, `citext`,
   `btree_gin`. All `CREATE EXTENSION IF NOT EXISTS` so the file
   is idempotent on re-runs.

2. **ltree column conversion** — `entity_node.ltree_path` is declared
   as `TEXT` in `schema.prisma` (Prisma has no first-class ltree type),
   then promoted to a real `ltree` column here with a GiST index and a
   composite `(tenant_id, ltree_path)` GiST index for fast tenant-scoped
   subtree queries.

3. **pg_trgm fuzzy indexes** — `supplier.name`, `document.original_name`,
   `entity_node.name`. Powers the global "did you mean X" search bar.

4. **Row-Level Security** — RLS is `ENABLE`d and `FORCE`d on every
   tenant-scoped table, plus the `tenant` table itself. Policies are
   driven by two session GUCs:

   - `app.current_tenant_id` — set by the API gateway after JWT verify,
     before any query runs in the transaction.
   - `app.bypass_rls` — set to `'true'` only by migrations or admin
     break-glass tooling; the policy short-circuits to allow-all when
     it is true.

   Tables that don't carry `tenant_id` directly (`role_assignment`,
   `survey_response`, `approval_action`, `audit_exception`,
   `supplier_invite`, `supplier_response`, `supplier_score`,
   `copilot_message`) reach tenant via an `EXISTS` subquery into the
   parent table. There is one policy per table named
   `<table>_tenant_isolation` (or `tenant_self_isolation` for `tenant`).

5. **audit_log hash chain** — each insert into `audit_log` gets
   `prev_hash` (previous row's `row_hash` for the same tenant) and
   `row_hash = sha256(prev_hash || payload)`. UPDATE and DELETE are
   blocked by triggers, so the chain forms a tamper-evident,
   append-only record. Auditors can replay the chain offline to
   detect modifications. The two columns are added via `ALTER TABLE …
   ADD COLUMN IF NOT EXISTS` because Prisma does not model them.

6. **Partitioning** — comment block describing the strategy. The
   actual `CREATE TABLE … PARTITION BY` work is deferred to
   `02_partitions/migration.sql` to avoid colliding with Prisma's
   `CREATE TABLE` for the unpartitioned table.

7. **Composite / partial indexes** — `metric_event` lookup index,
   `extraction_field` low-confidence partial index for the
   review-queue dashboard, `supplier` non-archived partial index.

## Operating conventions

### Setting the tenant GUC

Every request handler must open a transaction and call:

```sql
SET LOCAL app.current_tenant_id = '<tenantId>';
```

`SET LOCAL` is critical — it scopes the GUC to the transaction so it
doesn't leak across pooled connections. If your code uses Prisma's
`$transaction(async (tx) => …)`, run the `SET LOCAL` as the first
statement inside the callback.

### Bypassing RLS (use sparingly)

For migrations, backfills, or break-glass operations:

```sql
SET LOCAL app.bypass_rls = 'true';
```

This must be wrapped in a transaction. Never set it at session scope
in long-lived connections.

### audit_log

The `audit_log` table is append-only at the DB level: the
`audit_log_no_update` and `audit_log_no_delete` triggers will raise
`audit_log is append-only` for any UPDATE or DELETE, including from
the `tenant` owner role. The hash chain is computed in a BEFORE INSERT
trigger; application code does NOT need to populate `prev_hash` or
`row_hash`. To verify the chain offline, walk rows ordered by
`(tenant_id, created_at, id)` and re-derive `sha256(prev_hash || payload)`.

### Adding a new tenant-scoped table

1. Add the model in `schema.prisma` with `tenantId String` +
   `@@index([tenantId])`.
2. In the next migration, add:

   ```sql
   ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
   ALTER TABLE "<table>" FORCE  ROW LEVEL SECURITY;
   CREATE POLICY "<table>_tenant_isolation" ON "<table>"
     USING      (rls_bypass() OR tenant_id = current_tenant_id())
     WITH CHECK (rls_bypass() OR tenant_id = current_tenant_id());
   ```

3. If the table doesn't carry `tenant_id` directly, use an `EXISTS`
   subquery to the parent table the same way `role_assignment` does.
