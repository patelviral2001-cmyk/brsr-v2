-- Keycloak requires its own database. Postgres has no `CREATE DATABASE IF NOT
-- EXISTS`, so we guard via a DO block that checks pg_database first.
DO
$$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'keycloak') THEN
        PERFORM dblink_exec('dbname=' || current_database(),
                            'CREATE DATABASE keycloak OWNER brsr');
    END IF;
EXCEPTION
    WHEN undefined_function THEN
        -- dblink not available; fall back to a plain CREATE DATABASE wrapped
        -- in an exception handler. This branch executes via the outer block
        -- only when dblink isn't installed (the typical case on a fresh
        -- postgres:16-alpine).
        BEGIN
            CREATE DATABASE keycloak OWNER brsr;
        EXCEPTION WHEN duplicate_database THEN
            RAISE NOTICE 'database keycloak already exists, skipping';
        END;
END
$$;
