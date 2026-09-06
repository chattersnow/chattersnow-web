-- Multi-tenancy Phase 4 (#707): per-tenant data export and deletion.
--
-- Part 2 of 3. Both walk the catalog for every table that carries a
-- tenant_id column rather than a hand-written list, for the same reason
-- tenant_isolation_gaps() does: a table added next month is exported and
-- deleted with the rest, and the isolation suite's TENANT_TABLES list is
-- what asserts the two views of the schema agree.
--
-- Export: one JSON document -- the tenant row, its memberships (with the
-- account emails, which live in auth.users and would otherwise be lost), the
-- audit trail for its rows, and every row of every tenant table keyed by
-- table name. A tenant's own admin can take it from Administration > System
-- Settings > Data; the platform operator can take it for any tenant with
-- `bun run tenant:export` (service_role). It is the answer to "give us our
-- data" and the input to a migration off the platform.
--
-- Deletion: service_role only, and only for a tenant already marked
-- `archived`. That two-step is the safety catch: a typo'd id names an active
-- tenant and is refused, and archiving first takes the tenant off every
-- host and every switcher before anything is destroyed. The order of
-- deletion is not hand-written either -- every foreign key between tenant
-- tables is composite (Phase 3), so each table is deleted by tenant_id and
-- any pass that hits a still-referenced parent is retried after its children
-- have gone. The audit rows go last, because deleting every row writes one.
--
-- Accounts are not touched: auth.users is platform-wide and an account may
-- belong elsewhere. deactivated_users and user_onboarding are per account
-- and stay with it. Storage holds nothing per tenant today (site images are
-- Google Drive links stored in app_settings).

create or replace function public.tenant_data_snapshot(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_tables jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_table text;
begin
  for v_table in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.tenant_id = $1',
      v_table
    ) into v_rows using p_tenant_id;
    v_tables := v_tables || jsonb_build_object(v_table, v_rows);
  end loop;

  return jsonb_build_object(
    'exported_at', now(),
    'tenant', (select to_jsonb(t) from public.tenants t where t.id = p_tenant_id),
    'memberships', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', tm.user_id,
        'email', u.email,
        'kind', tm.kind,
        'expires_at', tm.expires_at,
        'reason', tm.reason,
        'created_at', tm.created_at
      ) order by u.email), '[]'::jsonb)
      from public.tenant_memberships tm
      join auth.users u on u.id = tm.user_id
      where tm.tenant_id = p_tenant_id
    ),
    'audit_log', (
      select coalesce(jsonb_agg(to_jsonb(al) order by al.occurred_at), '[]'::jsonb)
      from public.audit_log al
      where al.tenant_id = p_tenant_id
    ),
    'tables', v_tables
  );
end;
$$;

revoke execute on function public.tenant_data_snapshot(uuid) from public;

-- The tenant's own copy, for its admin.
create or replace function public.export_current_tenant_data()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.is_admin() and public.current_tenant_id() is not null
    then public.tenant_data_snapshot(public.current_tenant_id())
  end;
$$;

comment on function public.export_current_tenant_data() is
  'Every row the current tenant owns, as one JSON document. Admin only; null otherwise.';

revoke execute on function public.export_current_tenant_data() from public;
grant execute on function public.export_current_tenant_data() to authenticated;

-- Any tenant, for the platform operator.
create or replace function public.export_tenant_data(p_tenant_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select public.tenant_data_snapshot(p_tenant_id);
$$;

revoke execute on function public.export_tenant_data(uuid) from public;
grant execute on function public.export_tenant_data(uuid) to service_role;

create or replace function public.delete_tenant(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_remaining text[];
  v_next text[];
  v_table text;
  v_pass integer := 0;
  v_count bigint;
  v_counts jsonb := '{}'::jsonb;
begin
  select t.status into v_status from public.tenants t where t.id = p_tenant_id;
  if v_status is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  if v_status <> 'archived' then
    raise exception 'TENANT_NOT_ARCHIVED';
  end if;

  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
  into v_remaining
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
  where n.nspname = 'public' and c.relkind = 'r';

  -- Each pass deletes what it can; a table whose rows are still referenced
  -- by another tenant table is left for the next pass, once those children
  -- are gone. The schema has no cycle a per-table statement cannot clear, so
  -- a pass that removes nothing means something outside this function holds
  -- a reference, and that is an error rather than a silent partial delete.
  while array_length(v_remaining, 1) is not null loop
    v_pass := v_pass + 1;
    v_next := '{}';
    foreach v_table in array v_remaining loop
      begin
        execute format('delete from public.%I where tenant_id = $1', v_table)
          using p_tenant_id;
        get diagnostics v_count = row_count;
        v_counts := v_counts || jsonb_build_object(v_table, v_count);
      exception when foreign_key_violation then
        v_next := v_next || v_table;
      end;
    end loop;

    if array_length(v_next, 1) = array_length(v_remaining, 1) then
      raise exception 'TENANT_DELETE_BLOCKED: %', array_to_string(v_next, ', ');
    end if;
    v_remaining := v_next;
  end loop;

  delete from public.audit_log al where al.tenant_id = p_tenant_id;
  get diagnostics v_count = row_count;
  v_counts := v_counts || jsonb_build_object('audit_log', v_count);

  -- Memberships and selections cascade from the tenant row.
  delete from public.tenants t where t.id = p_tenant_id;

  return jsonb_build_object('tenant_id', p_tenant_id, 'passes', v_pass, 'deleted', v_counts);
end;
$$;

comment on function public.delete_tenant(uuid) is
  'Deletes every row a tenant owns, its audit trail, and the tenant itself. Refused unless the tenant is archived. service_role only.';

revoke execute on function public.delete_tenant(uuid) from public;
grant execute on function public.delete_tenant(uuid) to service_role;
