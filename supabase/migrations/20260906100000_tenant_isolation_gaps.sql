-- Multi-tenancy Phase 3 (#707): the isolation invariants, checkable from
-- outside.
--
-- 20260906070000 and 20260906080000 are generated from the catalog, so what
-- they guarantee is whatever the catalog held when they ran. A migration
-- written next month that adds a table with the old-style
-- `using (has_permission(...))` policy, or a single-column foreign key
-- between two tenant tables, would reopen the gap silently -- no error, no
-- failing test, exactly the failure #707 names as its largest risk.
--
-- tenant_isolation_gaps() lists every such gap. It reads pg_catalog only,
-- and the isolation suite
-- (src/lib/portal/tenant-isolation.integration.test.ts) asserts it is empty
-- on every run, so the invariant is enforced on every future migration set
-- rather than on the two that introduced it. It is also the check this
-- migration runs on itself, below.
--
-- Two kinds of gap:
--
--   policy   a policy on a table with tenant_id whose USING and WITH CHECK
--            expressions never mention tenant_id. The one intended exception
--            is user_roles "user views own roles": a user's own role rows,
--            across every tenant, for the switcher and the account page.
--   fk       a foreign key between two tenant tables that references the
--            parent's `id` on its own rather than (tenant_id, id).
--
-- Admin only: the output names tables and policies, which is schema rather
-- than data, but there is no reason to hand it to every signed-in user.

create or replace function public.tenant_isolation_gaps()
returns table (kind text, table_name text, detail text)
language sql
security definer
set search_path = public
stable
as $$
  with tenant_tables as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
    where n.nspname = 'public'
      and c.relkind = 'r'
  )
  select 'policy'::text, p.tablename::text, p.policyname::text
  from pg_policies p
  join tenant_tables t on t.relname = p.tablename
  where public.is_admin()
    and p.schemaname = 'public'
    and coalesce(p.qual, '') !~ 'tenant_id'
    and coalesce(p.with_check, '') !~ 'tenant_id'
    and not (p.tablename = 'user_roles' and p.policyname = 'user views own roles')

  union all

  select 'fk'::text, ch.relname::text, c.conname::text
  from pg_constraint c
  join tenant_tables ch on ch.oid = c.conrelid
  join tenant_tables pa on pa.oid = c.confrelid
  join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
  where public.is_admin()
    and c.contype = 'f'
    and array_length(c.conkey, 1) = 1
    and fa.attname = 'id'

  order by 1, 2, 3;
$$;

comment on function public.tenant_isolation_gaps() is
  'Policies on tenant tables with no tenant predicate, and single-column foreign keys between tenant tables. Empty on a correctly scoped schema; asserted empty by the isolation suite.';

revoke execute on function public.tenant_isolation_gaps() from public;
grant execute on function public.tenant_isolation_gaps() to authenticated, service_role;

-- Self-check: refuse to leave the schema with a gap the two generated
-- migrations were supposed to close. is_admin() is false in a migration, so
-- the underlying queries are repeated here without the gate.
do $$
declare
  v_gaps text;
begin
  with tenant_tables as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  gaps as (
    select 'policy ' || p.tablename || '."' || p.policyname || '"' as gap
    from pg_policies p
    join tenant_tables t on t.relname = p.tablename
    where p.schemaname = 'public'
      and coalesce(p.qual, '') !~ 'tenant_id'
      and coalesce(p.with_check, '') !~ 'tenant_id'
      and not (p.tablename = 'user_roles' and p.policyname = 'user views own roles')
    union all
    select 'fk ' || ch.relname || '.' || c.conname
    from pg_constraint c
    join tenant_tables ch on ch.oid = c.conrelid
    join tenant_tables pa on pa.oid = c.confrelid
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.contype = 'f'
      and array_length(c.conkey, 1) = 1
      and fa.attname = 'id'
  )
  select string_agg(gap, ', ') into v_gaps from gaps;

  if v_gaps is not null then
    raise exception 'Tenant isolation gaps remain: %', v_gaps;
  end if;
end $$;
