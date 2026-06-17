-- =====================================================================
-- BRSR primary database extensions.
-- Runs ONCE on first boot of the `brsr` database via the
-- /docker-entrypoint-initdb.d hook.
--
-- Note: postgres:16-alpine ships pgcrypto, ltree, pg_trgm, citext,
-- btree_gin, and pg_stat_statements. `vector` (pgvector) is only
-- available on the `pgvector/pgvector:pg16` image and is therefore
-- left as a commented hint -- uncomment ONLY after switching the
-- postgres image in docker-compose.prod.yml.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Optional: enable only if you swap to `pgvector/pgvector:pg16` image.
-- CREATE EXTENSION IF NOT EXISTS vector;
