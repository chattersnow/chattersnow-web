-- #901: the operator sets a tenant's modules without a SQL shell.
--
-- #900 made module entitlements real in the database and deliberately gave
-- `tenant_modules` no write policy for anyone. So everything here is a definer
-- RPC behind require_platform_operator() -- the three-condition gate from
-- 20260906180000: `platform_tenants:manage`, a full (non-support) membership,
-- and a tenant on the `internal` plan. All three, always.
--
-- The comment at the top of that migration explains why there is no
-- super-admin, and nothing here introduces one. These two functions read and
-- write tenant metadata; neither touches a customer row.

-- ---------------------------------------------------------------------------
-- 1. Audit the writes
-- ---------------------------------------------------------------------------

-- "Who turned Finance off for this customer, and when" is the question this
-- page will be asked six months from now, so the write is audited before it is
-- possible.
--
-- #421 replaced the old `audit_log.table_name` check constraint with the
-- `audited_tables` registry (20260828060000), so onboarding a table is one
-- additive insert and a trigger rather than retyping an allowlist -- which is
-- what silently dropped `pending_role_grants` once already.
--
-- `pk_column` is `tenant_id`: `tenant_modules` is keyed by (tenant_id,
-- module_key) and has no surrogate id, and `audit_log.record_id` is a uuid. So
-- a row's `record_id` is the tenant whose entitlements changed, which is the
-- axis anyone reads this log along; which module it was, and what it became,
-- are in old_data/new_data. (retention_policies, the other composite-keyed
-- audited table, hashes its key into a v5 uuid instead -- worth it there
-- because its rows are the records being asked about, and not worth it here,
-- where the tenant is.)
--
-- The trigger covers insert as well as update, so provision_tenant()'s seed
-- lands in the log too: what an organization was sold on day one is part of
-- the same story as what changed afterwards. The #900 backfill is not in it --
-- that ran before this trigger existed, and it recorded no decision anyone
-- made about any particular tenant.
insert into public.audited_tables (table_name, pk_column) values
  ('tenant_modules', 'tenant_id');

create trigger audit_log_row after insert or update or delete on public.tenant_modules
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 2. Reading
-- ---------------------------------------------------------------------------

-- `source` is the column that makes this page usable. Without it the operator
-- cannot tell "on because we said so for this organization" from "on because
-- nobody has said otherwise", and those call for different actions: the first
-- is a decision someone took, the second is a default that will move under them
-- if the plan's defaults ever change.
--
-- It resolves in the same order tenant_module_enabled() does -- the tenant's
-- own row, else its plan's default, else the catalog default -- so what the
-- page shows is what has_permission() will answer, by construction rather than
-- by two implementations agreeing.
create or replace function public.platform_list_tenant_modules(p_tenant_id uuid)
returns table (
  module_key text,
  label text,
  description text,
  sort_order integer,
  is_core boolean,
  enabled boolean,
  source text,
  updated_at timestamptz,
  updated_by_email text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_plan text;
begin
  perform public.require_platform_operator();

  select t.plan into v_plan from public.tenants t where t.id = p_tenant_id;
  if v_plan is null then
    raise exception 'No such tenant';
  end if;

  return query
    select
      m.key,
      m.label,
      m.description,
      m.sort_order,
      m.is_core,
      coalesce(tm.enabled, pm.enabled, m.default_enabled),
      case
        when tm.module_key is not null then 'tenant'
        when pm.module_key is not null then 'plan'
        else 'default'
      end,
      tm.updated_at,
      u.email::text
    from public.modules m
    left join public.tenant_modules tm
      on tm.tenant_id = p_tenant_id and tm.module_key = m.key
    left join public.plan_modules pm
      on pm.plan = v_plan and pm.module_key = m.key
    left join auth.users u on u.id = tm.updated_by
    order by m.sort_order, m.key;
end;
$$;

comment on function public.platform_list_tenant_modules(uuid) is
  'One tenant''s module entitlements for the operator, with where each value comes from (#901). Platform operator only.';

grant execute on function public.platform_list_tenant_modules(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Writing
-- ---------------------------------------------------------------------------

-- Three refusals, each with a named error rather than a silent no-op, because
-- the caller is a dialog and the dialog has to be able to say why.
create or replace function public.platform_set_tenant_module(
  p_tenant_id uuid,
  p_module_key text,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_is_core boolean;
begin
  perform public.require_platform_operator();

  if p_enabled is null then
    raise exception 'An enabled value is required';
  end if;

  select t.plan into v_plan from public.tenants t where t.id = p_tenant_id;
  if v_plan is null then
    raise exception 'No such tenant';
  end if;

  select m.is_core into v_is_core from public.modules m where m.key = p_module_key;
  if v_is_core is null then
    raise exception 'Unknown module: %', p_module_key;
  end if;

  -- The #900 trigger refuses this too, whoever writes it. Checked here anyway
  -- so the operator gets a sentence instead of a constraint violation, and the
  -- same shape platform_set_tenant_status() uses for archiving the internal
  -- tenant: the refusal that matters is stated where the decision is made.
  if v_is_core and not p_enabled then
    raise exception 'The % module is core and cannot be turned off for anyone', p_module_key;
  end if;

  -- There is no second door. Platform administration resolves only inside a
  -- tenant on the `internal` plan, so disabling a module there is this page
  -- taking itself apart -- the same reasoning that stops the operator
  -- suspending the internal tenant from the Platform page.
  if v_plan = 'internal' and not p_enabled then
    raise exception 'The platform tenant''s own modules cannot be turned off from here';
  end if;

  insert into public.tenant_modules (tenant_id, module_key, enabled, updated_at, updated_by)
  values (p_tenant_id, p_module_key, p_enabled, now(), auth.uid())
  on conflict (tenant_id, module_key) do update
    set enabled = excluded.enabled,
        updated_at = now(),
        updated_by = auth.uid();
end;
$$;

comment on function public.platform_set_tenant_module(uuid, text, boolean) is
  'Sets one module''s entitlement for one tenant (#901). Refuses an unknown module, a core module, and disabling anything on the platform''s own tenant. Platform operator only.';

grant execute on function public.platform_set_tenant_module(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Isolation self-check (20260906100000)
-- ---------------------------------------------------------------------------

-- No new table and no new policy, but run it anyway: a new trigger on a tenant
-- table and two new definer functions is exactly the kind of migration where
-- "I did not touch a policy" is worth verifying rather than believing.
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
