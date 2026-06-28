-- Langfuse requires its own database; same idempotent pattern as the Keycloak
-- init script.
DO
$$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'langfuse') THEN
        PERFORM dblink_exec('dbname=' || current_database(),
                            'CREATE DATABASE langfuse OWNER brsr');
    END IF;
EXCEPTION
    WHEN undefined_function THEN
        BEGIN
            CREATE DATABASE langfuse OWNER brsr;
        EXCEPTION WHEN duplicate_database THEN
            RAISE NOTICE 'database langfuse already exists, skipping';
        END;
END
$$;
