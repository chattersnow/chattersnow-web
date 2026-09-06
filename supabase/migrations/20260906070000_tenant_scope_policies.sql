-- Multi-tenancy Phase 3 (#707): every policy on every tenant table filters on
-- the caller's current tenant.
--
-- Until now the bulk of the schema's policies were `has_permission(...)`
-- alone. Phase 2 made has_permission() answer for one tenant, but a policy
-- with no tenant predicate still lets an events:view holder in tenant A read
-- tenant B's events -- the permission is per tenant, the rows are not. This
-- migration puts `tenant_id = (select public.current_tenant_id())` in front
-- of every such predicate.
--
-- Generated from the catalog rather than written out: 262 policies on 76
-- tables, every one the same edit. The loop below reads each policy's
-- deparsed USING / WITH CHECK expression from pg_policies, drops it, and
-- recreates it under the same name, for the same command and roles, with
-- the tenant predicate ANDed in front of the original expression. That also
-- catches the giveaway policies 20260904100000 emits through execute
-- format(), which a file of literal `create policy` statements would have
-- had to special-case, and it means the rewrite is exactly as complete as
-- the catalog is -- which the isolation suite then checks
-- (src/lib/portal/tenant-isolation.integration.test.ts asserts that every
-- policy on every tenant table carries the predicate).
--
-- `(select ...)` rather than a bare call is what makes Postgres evaluate
-- current_tenant_id() once per statement as an InitPlan instead of once per
-- row; has_permission() calls in the existing predicates are left as they
-- were.
--
-- Skipped on purpose:
--
-- - Policies that already reference tenant_id: the permission core, app
--   settings, inventory categories, tenant_memberships (Phase 2), and
--   audit_log, whose predicate admits the current tenant's rows *or* rows
--   with no tenant (the global tables).
-- - user_roles "user views own roles" (user_id = auth.uid()): the account
--   page and the tenant switcher need every tenant's roles for the signed-in
--   user, and a row about yourself is not another tenant's data.
-- - Tables with no tenant_id column. `resources` is the global permission
--   catalog; its `using (true)` select is correct.
--
-- A policy FOR ALL with no WITH CHECK of its own uses its USING expression
-- for both, so the rewrite adds a WITH CHECK only where the original had
-- one; the tenant predicate reaches both sides either way.

do $$
declare
  v_policy record;
  v_tenant_predicate constant text := 'tenant_id = (select public.current_tenant_id())';
  v_using text;
  v_check text;
  v_sql text;
  v_rewritten integer := 0;
begin
  for v_policy in
    select p.schemaname, p.tablename, p.policyname, p.cmd, p.permissive, p.roles, p.qual, p.with_check
      from pg_policies p
      join information_schema.columns c
        on c.table_schema = p.schemaname
       and c.table_name = p.tablename
       and c.column_name = 'tenant_id'
     where p.schemaname = 'public'
       and coalesce(p.qual, '') !~ 'tenant_id'
       and coalesce(p.with_check, '') !~ 'tenant_id'
       and not (p.tablename = 'user_roles' and p.policyname = 'user views own roles')
     order by p.tablename, p.policyname
  loop
    v_using := case
      when v_policy.qual is null then null
      else format('%s and (%s)', v_tenant_predicate, v_policy.qual)
    end;
    v_check := case
      when v_policy.with_check is null then null
      else format('%s and (%s)', v_tenant_predicate, v_policy.with_check)
    end;

    execute format('drop policy %I on %I.%I',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename);

    v_sql := format('create policy %I on %I.%I as %s for %s to %s',
      v_policy.policyname, v_policy.schemaname, v_policy.tablename,
      v_policy.permissive, v_policy.cmd,
      array_to_string(v_policy.roles, ', '));
    if v_using is not null then
      v_sql := v_sql || format(' using (%s)', v_using);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
    v_rewritten := v_rewritten + 1;
  end loop;

  raise notice 'tenant predicate added to % policies', v_rewritten;
end $$;
