-- Multi-tenancy Phase 1 (#707): tenant identity, and nothing else.
--
-- This migration adds three tables and four helper functions. It does not
-- touch an existing table, policy, or RPC, so nothing in the application
-- changes behaviour yet -- Phase 2 adds tenant_id to the ~78 tenant tables
-- and Phase 3 rewrites the 348 policies to filter on it.
--
-- Two naming/design decisions are settled here and recorded in full in the
-- planning repo (decisions/2026-09-05-multi-tenancy-model.md):
--
-- 1. The tenant is `tenants`, not `organizations`. "Organization" already
--    means three different things in this schema: a `people` row with
--    person_type = 'organization' (20260903040000, #625), the
--    person_organizations.organization_id edge -- which is a foreign key to
--    `people`, not to any tenant -- and the `org.*` app_settings namespace
--    meaning Chatter Snow itself. A tenant table named `organizations`
--    would put two columns called organization_id in one schema meaning
--    different things.
--
-- 2. There is no super-admin bypass. Platform staff hold a time-boxed
--    `support` membership in one specific tenant instead of an
--    `or is_platform_admin()` branch inside has_permission(). That keeps
--    every Phase 3 policy predicate a single
--    `tenant_id = current_tenant_id() and has_permission(...)`, and keeps
--    platform access inside the generated isolation suite rather than
--    exempt from it. is_admin() is likewise not a bypass today -- it is
--    just has_permission('administration', 'manage') -- and this migration
--    keeps it that way.
--
-- auto_expose_new_tables is unset in this project's config, so every table
-- below needs an explicit grant alongside its RLS policies.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Phase 4 resolves a request host to a tenant through this column, so it
  -- is stored already-normalised rather than lowercased at every lookup.
  custom_domain text unique check (custom_domain is null or custom_domain = lower(custom_domain)),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  plan text not null default 'internal' check (plan in ('internal', 'demo', 'white_label')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();

-- Who may act inside a tenant.
--
-- `member` is an ordinary, permanent grant. `support` is the platform-staff
-- grant from decision 2: always time-boxed, always carrying a reason, and
-- writable only by service_role -- the insert policy below pins authenticated
-- writes to kind = 'member', so a tenant admin can never mint one.
create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'member' check (kind in ('member', 'support')),
  expires_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  unique (user_id, tenant_id),
  constraint tenant_memberships_support_is_time_boxed check (
    kind <> 'support'
    or (expires_at is not null and reason is not null and length(btrim(reason)) > 0)
  ),
  constraint tenant_memberships_member_is_permanent check (
    kind <> 'member' or (expires_at is null and reason is null)
  )
);

-- unique (user_id, tenant_id) already covers lookups by user, which is what
-- my_tenant_ids() does on every policy evaluation. This covers the reverse --
-- "who is in this tenant" -- for the administration screens.
create index tenant_memberships_tenant_id_idx on public.tenant_memberships (tenant_id);

-- Which tenant a multi-tenant user is currently looking at. Deliberately
-- separate from the membership row so switching never rewrites the grant
-- itself, and so revoking a membership cannot be undone by a stale selection
-- (current_tenant_id() re-checks the membership every time).
create table public.user_tenant_selection (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- The caller's live memberships: not expired, and in a tenant that is still
-- active. security definer for the same reason has_permission() is
-- (20260822090000) -- it reads the very tables whose policies call it, so an
-- invoker-rights function would recurse.
create or replace function public.my_tenant_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select tm.tenant_id
  from public.tenant_memberships tm
  join public.tenants t on t.id = tm.tenant_id
  where tm.user_id = auth.uid()
    and (tm.expires_at is null or tm.expires_at > now())
    and t.status = 'active';
$$;

-- The tenant this request is for: the user's explicit selection when it is
-- still backed by a live membership, otherwise their only membership,
-- otherwise null.
--
-- From Phase 3 this is called by every RLS policy in the schema. Policies
-- must call it as `(select public.current_tenant_id())` rather than bare, so
-- Postgres evaluates it once as an InitPlan instead of once per row.
--
-- If the per-policy join ever costs too much, the replacement is a Supabase
-- custom access token hook stamping tenant_id into the JWT (available on the
-- Free plan). Callers do not change; only this function does.
create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select s.tenant_id
       from public.user_tenant_selection s
      where s.user_id = auth.uid()
        and s.tenant_id in (select public.my_tenant_ids())),
    -- Exactly one membership needs no selection. More than one and the user
    -- has to pick, so this deliberately resolves to null until they do.
    -- (No aggregate here: Postgres has no min(uuid).)
    (select t
       from public.my_tenant_ids() t
      where (select count(*) from public.my_tenant_ids()) = 1)
  );
$$;

-- Switch tenants. Rejects anything the caller is not a live member of, which
-- is why user_tenant_selection has no insert/update policy of its own: this
-- is the only write path.
create or replace function public.set_current_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.my_tenant_ids() t where t = p_tenant_id) then
    raise exception 'Not a member of tenant %', p_tenant_id using errcode = '42501';
  end if;

  insert into public.user_tenant_selection (user_id, tenant_id, updated_at)
  values (auth.uid(), p_tenant_id, now())
  on conflict (user_id) do update
    set tenant_id = excluded.tenant_id,
        updated_at = now();
end;
$$;

-- Join a signed-in user to their tenant if they have none, called from the
-- portal layout beside ensure_current_person().
--
-- This grants access, so the guard matters: it only ever fires when the
-- database contains exactly one active tenant. That is a deliberate stopgap
-- for the single-tenant present -- Phase 3 replaces it with resolution from
-- the request host, which is also what the anon-facing RPCs and public_*
-- views will need. Until then the guard is what stops a stray signup on a
-- multi-tenant database silently joining somebody else's organisation.
create or replace function public.ensure_tenant_membership()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_active_tenants integer;
begin
  if auth.uid() is null then
    return null;
  end if;

  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is not null then
    return v_tenant_id;
  end if;

  -- current_tenant_id() is also null for a user who holds several
  -- memberships and has not chosen one. They must not be auto-joined to
  -- anything, so check for the absence of memberships, not its result.
  if exists (select 1 from public.my_tenant_ids()) then
    return null;
  end if;

  select count(*) into v_active_tenants
  from public.tenants
  where status = 'active';

  if v_active_tenants <> 1 then
    return null;
  end if;

  select id into v_tenant_id from public.tenants where status = 'active';

  insert into public.tenant_memberships (user_id, tenant_id, kind, created_by)
  values (auth.uid(), v_tenant_id, 'member', auth.uid())
  on conflict (user_id, tenant_id) do nothing;

  return v_tenant_id;
end;
$$;

alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.user_tenant_selection enable row level security;

create policy "tenants select" on public.tenants for select to authenticated
  using (id in (select public.my_tenant_ids()));

-- A tenant admin may rename their own tenant and nothing else: slug, status,
-- plan and custom_domain are platform concerns, and custom_domain in
-- particular is unique across tenants, so letting a customer set it would let
-- them claim another tenant's host. The column-level grant below is what
-- actually enforces that; this policy scopes it to their own row.
--
-- has_permission() is still global until Phase 2 makes user_roles per-tenant,
-- so today "administration:manage" means admin everywhere. The
-- current_tenant_id() predicate is what keeps the write scoped in the
-- meantime, and it is already the shape Phase 3 generalises.
create policy "tenants update" on public.tenants for update to authenticated
  using (
    id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  )
  with check (
    id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

-- No insert or delete policy, and no insert or delete grant: provisioning and
-- deprovisioning a tenant is a service_role operation
-- (20260826320000_grant_service_role_table_access.sql), not something any
-- signed-in user can do.
grant select on public.tenants to authenticated;
grant update (name) on public.tenants to authenticated;

-- Everyone can see their own memberships -- the switcher needs that, and it
-- has to work before current_tenant_id() resolves to anything. Seeing anyone
-- else's requires administration:manage inside a shared tenant.
create policy "tenant_memberships select" on public.tenant_memberships for select to authenticated
  using (
    user_id = auth.uid()
    or (
      tenant_id in (select public.my_tenant_ids())
      and public.has_permission('administration', 'manage')
    )
  );

-- kind = 'member' on every authenticated write path: a tenant admin manages
-- their own people and can never create, alter, or extend a platform support
-- grant. Those are service_role only.
create policy "tenant_memberships insert" on public.tenant_memberships for insert to authenticated
  with check (
    kind = 'member'
    and tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

create policy "tenant_memberships update" on public.tenant_memberships for update to authenticated
  using (
    kind = 'member'
    and tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  )
  with check (
    kind = 'member'
    and tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

create policy "tenant_memberships delete" on public.tenant_memberships for delete to authenticated
  using (
    kind = 'member'
    and tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

grant select, insert, update, delete on public.tenant_memberships to authenticated;

-- Read-only to the user it belongs to. Writes go through set_current_tenant()
-- so the membership check cannot be skipped, hence no write policy or grant.
create policy "user_tenant_selection select" on public.user_tenant_selection for select to authenticated
  using (user_id = auth.uid());

grant select on public.user_tenant_selection to authenticated;

grant execute on function public.my_tenant_ids() to authenticated;
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.set_current_tenant(uuid) to authenticated;
grant execute on function public.ensure_tenant_membership() to authenticated;

-- Audit coverage. The audited set is the audited_tables registry since #421
-- (20260828060000), so onboarding is one additive insert rather than a
-- retyped check constraint.
--
-- tenant_memberships grants access to an entire tenant's data, which is
-- strictly more privileged than the user_roles grants already in the set, and
-- `tenants` carries the status that decides whether a tenant is reachable at
-- all.
insert into public.audited_tables (table_name) values ('tenants'), ('tenant_memberships');

create trigger audit_log_row after insert or update or delete on public.tenants
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.tenant_memberships
  for each row execute function public.audit_log_row();
