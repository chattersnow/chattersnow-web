-- service_role has `bypassrls` at the role level, but Postgres still requires
-- explicit GRANTs for base table/sequence/function access -- that's separate
-- from RLS. This project's migrations (and the Supabase CLI's
-- `auto_expose_new_tables` default being unset, see supabase/config.toml)
-- only ever GRANT to `authenticated`/`anon`, never to `service_role`, so
-- createSupabaseAdminClient() (src/lib/supabase/admin.ts) currently gets
-- "permission denied" on ordinary tables. service_role bypasses RLS by role
-- attribute, so it needs GRANTs only -- no policies -- and this intentionally
-- does not touch any existing authenticated/anon grants or RLS policies.
--
-- Schema USAGE on public is already granted to service_role at cluster
-- bootstrap; the line below is a harmless no-op included for clarity.
grant usage on schema public to service_role;

-- Existing tables, sequences, and functions.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Future tables/sequences/functions: migrations run (and every table here is
-- owned by) the `postgres` role, so default privileges must be set FOR that
-- role -- setting them for supabase_admin (or omitting FOR ROLE, which
-- defaults to the current session role at ALTER DEFAULT PRIVILEGES time)
-- would not apply to objects created by later migrations.
alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on functions to service_role;
