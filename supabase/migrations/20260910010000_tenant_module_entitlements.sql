-- #900: modules -- the platform decides which sections a tenant gets.
--
-- A tenant today gets the whole portal. A nonprofit that runs no gear library
-- still gets Inventory, and the operator has no way to sell, stage or withhold
-- a section. This adds **modules**: a named group of resources, enabled per
-- tenant, with defaults derived from `tenants.plan`, and writable only by the
-- platform operator.
--
-- Two decisions are baked into that sentence and are worth stating rather than
-- inferring. Per-tenant flags rather than plan-only gating, because a customer
-- buys a shape rather than a tier -- two organizations on `white_label` can
-- want different halves of the product. And operator-only, because a tenant
-- admin owns their own permission matrix, so anything they can write is not a
-- gate; an entitlement a customer can grant themselves is a preference with a
-- stern comment on it.
--
-- WHY THIS IS ONE MIGRATION AND NOT FORTY ROUTE GUARDS
--
-- Everything in the portal resolves access through three functions and nothing
-- else: has_permission() (20260906030000) behind every RLS predicate and every
-- definer RPC; my_permissions() (same file, amended by 20260908010000) behind
-- the sidebar, the command palette, the quick actions, breadcrumbs, the
-- section-index redirects, requirePermission() in 48 route layouts, the
-- notification-preference kinds and every dashboard widget; and
-- people_with_permission() (20260906200000), the sessionless recipient resolver
-- the public submission senders use. Subtract disabled modules inside those
-- three and the whole product follows, database-level enforcement included. No
-- nav changes and no new route guards appear in this migration, and that is the
-- design working rather than an omission.
--
-- WHAT "OFF" MEANS
--
-- Hidden and frozen, never deleted. The rows stay, tenant_data_snapshot() still
-- exports them, delete_tenant() still removes them, and re-enabling restores the
-- section with its history intact. Nothing here deletes tenant data and nothing
-- here should be able to.
--
-- Deliberately not in scope: the operator UI, the CLI and the docs (follow-up),
-- the public site (which has its own choke point in PUBLIC_PAGE_SLOTS), a tenant
-- turning a granted module off for itself, and per-module pricing or expiry.

-- ---------------------------------------------------------------------------
-- 1. The catalog
-- ---------------------------------------------------------------------------

-- Global, not tenant-scoped -- the same shape and spirit as `resources`, which
-- 20260906010000 lists among the tables deliberately left unscoped. A module is
-- platform vocabulary: what it means has to be the same everywhere, or an
-- entitlement means something different per customer and the operator screen is
-- unreadable.
create table public.modules (
  key text primary key check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  label text not null check (btrim(label) <> ''),
  description text,
  sort_order integer not null default 0,
  -- What a tenant gets when nothing more specific says otherwise. Seeds
  -- plan_modules below, and is the last resort in the resolution order.
  default_enabled boolean not null,
  -- A module the product cannot run without. Never disable-able, by anyone,
  -- including service_role -- see the trigger in section 4.
  is_core boolean not null default false,
  constraint modules_core_is_enabled check (not is_core or default_enabled)
);

comment on table public.modules is
  'The global catalog of sellable product modules (#900). A resource belongs to exactly one; a tenant''s entitlement is per module, not per resource.';

alter table public.modules enable row level security;

-- Readable by any signed-in user, writable by nobody but the platform. The
-- catalog is not sensitive -- it is the list of things the product has -- and
-- the operator UI in the follow-up needs to render labels next to the flags.
create policy "authenticated read modules" on public.modules for select to authenticated
  using (true);
grant select on public.modules to authenticated;

-- Ordered to match the portal sidebar, so the operator screen in the follow-up
-- reads in the order a customer will see the product.
insert into public.modules (key, label, description, sort_order, default_enabled, is_core) values
  ('events', 'Events', 'Event planning, incidents, impact notes and event-day volunteer hours.', 10, true, false),
  ('artwork', 'Artwork', 'Open calls for artwork and the submissions they collect.', 20, true, false),
  ('calendar', 'Content Calendar', 'The content calendar, its work queue, brief templates and annual review.', 30, true, false),
  ('programs', 'Programs', 'Program definitions and the program impact report.', 40, true, false),
  ('inventory', 'Inventory', 'The gear library: items, donations, distribution and inventory reports.', 50, true, false),
  ('volunteers', 'Volunteers', 'Volunteer roles, applications, participation and hours logging.', 60, true, false),
  ('communications', 'Messages', 'The inbound contact inbox and outbound messaging.', 70, true, false),
  ('finance', 'Finance', 'Donations, grants, expenses, revenue, approvals and finance reporting.', 80, true, false),
  ('reimbursements', 'Reimbursements', 'Volunteer and staff reimbursement requests and their approvals.', 90, true, false),
  ('people', 'People', 'The people directory and intake. Core: every other module names a person.', 100, true, true),
  ('governance', 'Governance', 'Board meetings, bylaws, policies, resolutions and nonprofit status.', 110, true, false),
  ('access_management', 'Access Management', 'The asset inventory and periodic access reviews.', 120, true, false),
  ('administration', 'Administration', 'Users, roles, settings, site content and the platform control panel. Core.', 130, true, true);

-- ---------------------------------------------------------------------------
-- 2. Every resource belongs to exactly one module
-- ---------------------------------------------------------------------------

-- A column rather than a join table, because a resource belongs to exactly one
-- module and `not null` makes "every resource has a module" a constraint the
-- database enforces instead of a test somebody has to remember to run. A
-- migration next month that adds a resource without a module simply fails.
alter table public.resources
  add column module_key text references public.modules(key) on update cascade;

-- `resources.section` is close to the intended grouping but not the same thing,
-- and the two places it differs are product decisions rather than tidying:
--
--   * event_expenses and event_revenue say section 'Events' and go with
--     FINANCE. They are the money tabs on an event, and a tenant that is not
--     buying Finance should not see money on an event detail page. The
--     consequence -- turning Finance off removes two tabs from Events -- is
--     intended, not a side effect to be discovered later.
--   * platform_tenants says section 'Administration' and stays in the CORE
--     administration module, so that no configuration can ever gate the
--     operator out of the page that un-gates things. is_platform_operator()
--     calls has_permission(), so a module check able to disable
--     platform_tenants would be a one-way door.
--
-- The 'Workflow' section is not a module at all: it holds the four
-- self-service permissions (people_intake, inventory_intake,
-- volunteer_hours_logging, the two self-approvals), each of which belongs to
-- the module whose data it writes.
update public.resources res
set module_key = v.module_key
from (values
  ('events', 'events'),
  ('event_impact', 'events'),
  ('event_incidents', 'events'),
  ('event_volunteer_hours', 'events'),
  ('artwork_submissions', 'artwork'),
  ('content_calendar', 'calendar'),
  ('content_calendar_reports', 'calendar'),
  ('programs', 'programs'),
  ('programs_reports', 'programs'),
  ('inventory', 'inventory'),
  ('inventory_reports', 'inventory'),
  ('inventory_intake', 'inventory'),
  ('volunteers', 'volunteers'),
  ('volunteer_hours_logging', 'volunteers'),
  ('communications', 'communications'),
  ('finance', 'finance'),
  ('finance_approvals', 'finance'),
  ('finance_reports', 'finance'),
  ('finance_self_approval', 'finance'),
  ('event_expenses', 'finance'),
  ('event_revenue', 'finance'),
  ('reimbursements', 'reimbursements'),
  ('reimbursement_approvals', 'reimbursements'),
  ('reimbursement_self_approval', 'reimbursements'),
  ('governance', 'governance'),
  ('access_management_assets', 'access_management'),
  ('access_management_reviews', 'access_management'),
  ('people', 'people'),
  ('people_intake', 'people'),
  ('administration', 'administration'),
  ('system_settings', 'administration'),
  ('site_content', 'administration'),
  ('platform_tenants', 'administration')
) as v(resource_key, module_key)
where res.key = v.resource_key;

-- `set not null` would fail on its own, but with "column contains null values"
-- and no clue which row. Name the resources instead: whoever added one without
-- extending the map above is the person reading this error.
do $$
declare
  v_unmapped text;
begin
  select string_agg(res.key, ', ' order by res.key) into v_unmapped
  from public.resources res
  where res.module_key is null;

  if v_unmapped is not null then
    raise exception 'Resources with no module: %. Add them to the map in 20260910010000.', v_unmapped;
  end if;
end $$;

alter table public.resources alter column module_key set not null;

create index resources_module_key_idx on public.resources (module_key);

comment on column public.resources.module_key is
  'The module this resource is sold as part of (#900). has_permission() resolves to false for a resource whose module the tenant is not entitled to.';

-- An entitlement enforced through resources.module_key has to be unwritable by
-- the person it constrains. `admin manage resources` was `using (is_admin())`
-- with no tenant predicate -- correct while `resources` was an inert catalog,
-- and a hole the moment a column on it decides what a tenant can reach: any
-- tenant's admin could have moved `finance` into the core `people` module and
-- re-entitled themselves, and every other tenant along with them, since the
-- catalog is global. Nothing in the application writes this table (the
-- Permissions screen reads it); the CLI and migrations write it as service_role,
-- which these statements do not touch.
drop policy "admin manage resources" on public.resources;
revoke insert, update, delete on public.resources from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Plan defaults
-- ---------------------------------------------------------------------------

-- What "plan-derived defaults" means: provisioning reads this table. All three
-- plans are seeded identically from modules.default_enabled, so today it decides
-- nothing -- the table exists so that introducing a tier later is a seed row
-- rather than a change to provisioning logic.
create table public.plan_modules (
  plan text not null check (plan in ('internal', 'demo', 'white_label')),
  module_key text not null references public.modules(key) on update cascade,
  enabled boolean not null,
  primary key (plan, module_key)
);

comment on table public.plan_modules is
  'Per-plan module defaults (#900). provision_tenant() seeds tenant_modules from here, and it is the second step of the resolution order when a tenant has no row of its own.';

alter table public.plan_modules enable row level security;

create policy "authenticated read plan_modules" on public.plan_modules for select to authenticated
  using (true);
grant select on public.plan_modules to authenticated;

insert into public.plan_modules (plan, module_key, enabled)
select p.plan, m.key, m.default_enabled
from (values ('internal'), ('demo'), ('white_label')) as p(plan)
cross join public.modules m;

-- ---------------------------------------------------------------------------
-- 4. The per-tenant entitlement
-- ---------------------------------------------------------------------------

-- Primary key on (tenant_id, module_key) rather than a surrogate id, because
-- the enabled lookup is on the critical path of every portal query and this
-- makes it an index-only hit.
--
-- No `default public.default_tenant_id()` on tenant_id, unlike every other
-- tenant table: those carry the default so a signed-in session can insert its
-- own rows, and a session inserting its own entitlements is precisely what this
-- ticket exists to prevent. Every writer names the tenant.
--
-- No audit trigger: audit_log_row() keys on NEW.id, which a composite primary
-- key does not have. The follow-up's definer RPC is the single write path and
-- logs there.
create table public.tenant_modules (
  tenant_id uuid not null references public.tenants(id),
  module_key text not null references public.modules(key) on update cascade,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (tenant_id, module_key)
);

comment on table public.tenant_modules is
  'What the platform has sold one tenant (#900). Readable by that tenant, writable by nobody through row-level security -- writes go through the operator RPCs, the same way deactivated_users and the support grants already work.';

alter table public.tenant_modules enable row level security;

-- Members of the tenant may read their own entitlements: the operator UI and
-- the tenant-facing "what you have" surfaces in the follow-up need it, and a
-- tenant seeing the shape of what it bought is fine. There is deliberately no
-- insert, update or delete policy for anyone, and no write grant to go with
-- one -- an entitlement a tenant admin can write is not an entitlement.
create policy "tenant_modules select" on public.tenant_modules for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));

grant select on public.tenant_modules to authenticated;

create trigger set_updated_at before update on public.tenant_modules
  for each row execute function public.set_updated_at();

-- Belt and braces on is_core. The follow-up's RPC refuses a core module, but
-- the CLI and the seeds write as service_role, which bypasses row-level
-- security and would bypass the RPC too. A trigger is not bypassed by anyone.
-- It guards plan_modules as well as tenant_modules: a plan that disabled a core
-- module would hand every tenant provisioned onto it a portal with no People
-- screen, which is the same failure one step earlier.
create or replace function public.refuse_disabling_core_module()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.enabled and exists (
    select 1 from public.modules m where m.key = new.module_key and m.is_core
  ) then
    raise exception 'MODULE_IS_CORE: % cannot be disabled', new.module_key
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.refuse_disabling_core_module() is
  'Refuses an entitlement row that turns a core module off, whoever writes it -- including service_role, which bypasses row-level security but not triggers.';

create trigger refuse_disabling_core_module before insert or update on public.tenant_modules
  for each row execute function public.refuse_disabling_core_module();

create trigger refuse_disabling_core_module before insert or update on public.plan_modules
  for each row execute function public.refuse_disabling_core_module();

-- ---------------------------------------------------------------------------
-- 5. Resolution
-- ---------------------------------------------------------------------------

-- The rule, in one place: the tenant's own row if it has one, else the default
-- for its plan, else the catalog default, else enabled.
--
-- FAIL OPEN on a missing row -- the opposite of page-visibility.ts, and for a
-- reason worth writing down rather than rediscovering. A missing page-visibility
-- row means "nobody has approved publishing this yet", so the safe answer is
-- dark. A missing module row means "this tenant predates the table". Blacking
-- out an existing organization's Finance section because a seed missed it is
-- worse than showing them a section they were always shown. The backfill in
-- section 7 gives every tenant a full set; this is what happens when a future
-- backfill is incomplete.
create or replace function public.module_enabled_for_tenant(p_tenant_id uuid, p_module_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select tm.enabled
       from public.tenant_modules tm
      where tm.tenant_id = p_tenant_id
        and tm.module_key = p_module_key),
    (select pm.enabled
       from public.plan_modules pm
      where pm.plan = (select t.plan from public.tenants t where t.id = p_tenant_id)
        and pm.module_key = p_module_key),
    (select m.default_enabled from public.modules m where m.key = p_module_key),
    true
  );
$$;

comment on function public.module_enabled_for_tenant(uuid, text) is
  'Whether one named tenant is entitled to one module: its own row, else its plan''s default, else the catalog default, else true. Fails open on a missing row.';

-- Takes an arbitrary tenant, so it is service_role only, the same stance
-- people_with_permission() takes. A signed-in caller asks about itself through
-- tenant_module_enabled() below, which is owned by the same role and therefore
-- keeps its execute privilege here.
revoke execute on function public.module_enabled_for_tenant(uuid, text) from public, anon, authenticated;
grant execute on function public.module_enabled_for_tenant(uuid, text) to service_role;

create or replace function public.tenant_module_enabled(p_module_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.module_enabled_for_tenant((select public.current_tenant_id()), p_module_key);
$$;

comment on function public.tenant_module_enabled(text) is
  'Whether the tenant the caller is looking at is entitled to a module (#900).';

grant execute on function public.tenant_module_enabled(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The three choke points
-- ---------------------------------------------------------------------------

-- has_permission(), unchanged from 20260906030000 except the last predicate.
--
-- That predicate is module_enabled_for_tenant() written out rather than called,
-- and the duplication is deliberate. This is the hottest function in the
-- database: it is in every RLS predicate in the schema, most of which call it
-- unwrapped, so Postgres evaluates it once per row of the protected table. A
-- security definer function cannot be inlined, so calling one from here would
-- add a nested call per row on top of that; written out, the three arms are
-- primary-key lookups on tiny, fully-cached tables that the planner folds into
-- the existing filter. The rule still lives in one readable place above, and
-- the integration suite asserts the two agree.
--
-- The arms resolve the tenant as `ur.tenant_id`, not by calling
-- current_tenant_id() again, and that is not a shortcut -- the join above has
-- already constrained ur.tenant_id to equal it. The first draft of this
-- migration did call it again inside the subquery, where it is an InitPlan of a
-- correlated subplan and so is re-evaluated per row rather than once; it
-- doubled the donations list (22ms/2,625 buffers to 46ms/10,158). The pk lookup
-- was never the cost. Measured, not assumed -- the numbers are in the PR body.
--
-- Note also that this stays a filter on the join rather than an `or` branch
-- anywhere: nothing here widens what has_permission() returns, so
-- tenant_isolation_gaps() and the isolation suite keep meaning what they meant.
create or replace function public.has_permission(p_resource_key text, p_min_level text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(max(public.permission_rank(rp.level)), 0) >= public.permission_rank(p_min_level)
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.resources res on res.id = rp.resource_id
  where ur.user_id = auth.uid()
    and ur.tenant_id = (select public.current_tenant_id())
    and res.key = p_resource_key
    and not exists (
      select 1 from public.deactivated_users du where du.user_id = auth.uid()
    )
    and coalesce(
      (select tm.enabled
         from public.tenant_modules tm
        where tm.tenant_id = ur.tenant_id
          and tm.module_key = res.module_key),
      (select pm.enabled
         from public.plan_modules pm
        where pm.plan = (select t.plan from public.tenants t where t.id = ur.tenant_id)
          and pm.module_key = res.module_key),
      (select m.default_enabled from public.modules m where m.key = res.module_key),
      true
    );
$$;

comment on function public.has_permission(text, text) is
  'Whether the caller reaches p_min_level on a resource in the tenant they are looking at. False for a resource whose module the tenant is not entitled to (#900), whatever their matrix says.';

-- my_permissions(): report `none` for a resource whose module is off, as a new
-- arm of the same `case` 20260908010000 added for the inert platform_tenants
-- grant. That migration's comment explains why this is the right layer -- the
-- grant genuinely exists in the caller's matrix, and Administration >
-- Permissions still shows it as a row someone set; what changes is only what
-- the caller's *effective* permissions say they can reach -- and the reasoning
-- applies unchanged here.
--
-- `is false` rather than `not`, for the same reason the platform_tenants arm
-- uses `is not true`: a null answer must not fire a WHEN that hides a section.
--
-- The one-row `ctx` resolves current_tenant_id() once for the whole statement
-- instead of once per resource -- 33 rows, and the module check would otherwise
-- have added a second call to each of them. The `else` arm now reads it from
-- there too, which is the same value it was computing for itself before.
create or replace function public.my_permissions()
returns table (resource_key text, level text)
language sql
security definer
set search_path = public
stable
as $$
  select res.key, case
    when exists (select 1 from public.deactivated_users du where du.user_id = auth.uid())
    then 'none'
    when public.module_enabled_for_tenant(ctx.tenant_id, res.module_key) is false
    then 'none'
    when res.key = 'platform_tenants'
     and (select public.is_platform_operator()) is not true
    then 'none'
    else coalesce(
      (select rp.level
       from public.user_roles ur
       join public.role_permissions rp on rp.role_id = ur.role_id and rp.resource_id = res.id
       where ur.user_id = auth.uid()
         and ur.tenant_id = ctx.tenant_id
       order by public.permission_rank(rp.level) desc
       limit 1),
      'none'
    )
  end
  from public.resources res
  cross join (select (select public.current_tenant_id()) as tenant_id) ctx
  order by res.sort_order, res.key;
$$;

comment on function public.my_permissions() is
  'The caller''s effective permission level per resource, in the tenant they are looking at. `none` for a resource whose module the tenant is not entitled to (#900), and for platform_tenants unless is_platform_operator() holds.';

-- people_with_permission(): the same filter, and not an afterthought. Without
-- it a tenant with Volunteers off still receives volunteer-application email --
-- the senders run on a service-role client with no session and no RLS
-- underneath, which is exactly why this function exists. The tenant is a
-- parameter here for the same reason, so the module check takes one too.
create or replace function public.people_with_permission(
  p_tenant_id uuid,
  p_resource_keys text[],
  p_min_level text
)
returns table (
  person_id uuid,
  tenant_id uuid,
  email text,
  name text,
  preferred_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.tenant_id, p.email, p.name, p.preferred_name
    from public.people p
    join public.user_roles ur
      on ur.user_id = p.auth_user_id
     and ur.tenant_id = p.tenant_id
    join public.role_permissions rp
      on rp.role_id = ur.role_id
     and rp.tenant_id = ur.tenant_id
    join public.resources res
      on res.id = rp.resource_id
   where p.tenant_id = p_tenant_id
     and res.key = any(p_resource_keys)
     and public.module_enabled_for_tenant(p_tenant_id, res.module_key)
     and p.email is not null
     and p.auth_user_id is not null
     and not exists (
       select 1 from public.deactivated_users du
        where du.user_id = p.auth_user_id
     )
     and not exists (
       select 1 from public.tenant_memberships tm
        where tm.user_id = p.auth_user_id
          and tm.tenant_id = p.tenant_id
          and tm.kind = 'support'
     )
   group by p.id, p.tenant_id, p.email, p.name, p.preferred_name
  having max(public.permission_rank(rp.level)) >= public.permission_rank(p_min_level);
$$;

comment on function public.people_with_permission(uuid, text[], text) is
  'People in one named tenant whose portal roles reach p_min_level on any of p_resource_keys, excluding resources in a module that tenant is not entitled to (#900). Sessionless counterpart to has_permission().';

revoke execute on function public.people_with_permission(uuid, text[], text) from public, anon, authenticated;
grant execute on function public.people_with_permission(uuid, text[], text) to service_role;

-- The other readers of role_permissions were audited for the same gap:
-- list_event_leads() (20260827030000) sits behind has_permission('events',
-- 'manage') and is covered transitively; provision_tenant() reads the matrix to
-- copy it and must NOT filter -- a provisioned tenant gets the full matrix, and
-- the module flags decide what resolves.

-- ---------------------------------------------------------------------------
-- 7. Provisioning, and every tenant that already exists
-- ---------------------------------------------------------------------------

-- provision_tenant() as defined in 20260908080000, with one insert added.
--
-- Seeded from plan_modules for p_plan, NOT copied from the template tenant.
-- The template's entitlements are what the platform sold *that* organization,
-- and inheriting them is the same mistake the retention rules deliberately
-- avoid (20260906160000: every rule arrives in `dry_run` whatever the source
-- tenant has set).
create or replace function public.provision_tenant(
  p_name text,
  p_slug text,
  p_custom_domain text default null,
  p_plan text default 'white_label',
  p_admin_email text default null,
  p_template_tenant_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_template_id uuid;
  v_admin_role_id uuid;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'TENANT_NAME_REQUIRED';
  end if;

  v_template_id := coalesce(
    p_template_tenant_id,
    (select t.id from public.tenants t where t.plan = 'internal' order by t.created_at limit 1)
  );
  if v_template_id is null then
    raise exception 'TEMPLATE_TENANT_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.roles r where r.tenant_id = v_template_id and r.name = 'admin'
  ) then
    raise exception 'TEMPLATE_TENANT_HAS_NO_ADMIN_ROLE';
  end if;

  -- The slug and domain checks on the table do the validating; this only
  -- normalises what they will see.
  insert into public.tenants (name, slug, custom_domain, plan, status)
  values (
    btrim(p_name),
    lower(btrim(p_slug)),
    nullif(lower(btrim(coalesce(p_custom_domain, ''))), ''),
    p_plan,
    'active'
  )
  returning id into v_tenant_id;

  -- Roles: the five the platform seeds (20260821080000), by name from the
  -- template. A tenant that renamed or dropped one changes what it copies;
  -- the admin role is the one that is required (checked above), because the
  -- staged grant below and every administration screen depend on it.
  insert into public.roles (tenant_id, name, description)
  select v_tenant_id, r.name, r.description
  from public.roles r
  where r.tenant_id = v_template_id
    and r.name in ('admin', 'event_coordinator', 'finance', 'board', 'volunteer');

  -- The matrix for those roles. set_tenant_id_from_role stamps tenant_id.
  insert into public.role_permissions (role_id, resource_id, level)
  select nr.id, rp.resource_id, rp.level
  from public.role_permissions rp
  join public.roles tr on tr.id = rp.role_id and tr.tenant_id = v_template_id
  join public.roles nr on nr.tenant_id = v_tenant_id and nr.name = tr.name;

  -- The entitlements for the plan this tenant was sold (#900). The matrix
  -- above says what each role may reach; this says what the organization
  -- bought. Both are needed and they answer different questions.
  insert into public.tenant_modules (tenant_id, module_key, enabled)
  select v_tenant_id, pm.module_key, pm.enabled
  from public.plan_modules pm
  where pm.plan = p_plan;

  -- Catalog defaults that migrations give a fresh database: the inventory
  -- category vocabulary (20260904150000), the agenda templates
  -- (20260826050000) and the content brief templates (20260824105000).
  -- Copied whole from the template, current versions included, so a tenant
  -- starts with a working vocabulary rather than an empty picker. Everything
  -- else a migration seeded -- the observance calendar, the nonprofit-status
  -- milestones -- describes the template tenant itself and is not copied.
  insert into public.inventory_category_groups (tenant_id, key, label, sort_order, is_active)
  select v_tenant_id, g.key, g.label, g.sort_order, g.is_active
  from public.inventory_category_groups g
  where g.tenant_id = v_template_id;

  insert into public.inventory_categories (tenant_id, group_id, key, label, sort_order, is_active)
  select v_tenant_id, ng.id, c.key, c.label, c.sort_order, c.is_active
  from public.inventory_categories c
  join public.inventory_category_groups og on og.id = c.group_id
  join public.inventory_category_groups ng on ng.tenant_id = v_tenant_id and ng.key = og.key
  where c.tenant_id = v_template_id;

  insert into public.agenda_templates (tenant_id, key, name, description, is_active)
  select v_tenant_id, t.key, t.name, t.description, t.is_active
  from public.agenda_templates t
  where t.tenant_id = v_template_id;

  insert into public.agenda_template_versions (tenant_id, template_id, version, sections)
  select v_tenant_id, nt.id, v.version, v.sections
  from public.agenda_template_versions v
  join public.agenda_templates ot on ot.id = v.template_id
  join public.agenda_templates nt on nt.tenant_id = v_tenant_id and nt.key = ot.key
  where v.tenant_id = v_template_id;

  update public.agenda_templates nt
  set current_version_id = nv.id
  from public.agenda_templates ot
  join public.agenda_template_versions ov on ov.id = ot.current_version_id
  join public.agenda_template_versions nv
    on nv.tenant_id = v_tenant_id and nv.version = ov.version
  where nt.tenant_id = v_tenant_id
    and ot.tenant_id = v_template_id
    and nt.key = ot.key
    and nv.template_id = nt.id;

  insert into public.content_brief_templates (tenant_id, key, name, description, is_active, requires_consent)
  select v_tenant_id, t.key, t.name, t.description, t.is_active, t.requires_consent
  from public.content_brief_templates t
  where t.tenant_id = v_template_id;

  insert into public.content_brief_template_versions (tenant_id, template_id, version, fields)
  select v_tenant_id, nt.id, v.version, v.fields
  from public.content_brief_template_versions v
  join public.content_brief_templates ot on ot.id = v.template_id
  join public.content_brief_templates nt on nt.tenant_id = v_tenant_id and nt.key = ot.key
  where v.tenant_id = v_template_id;

  update public.content_brief_templates nt
  set current_version_id = nv.id
  from public.content_brief_templates ot
  join public.content_brief_template_versions ov on ov.id = ot.current_version_id
  join public.content_brief_template_versions nv
    on nv.tenant_id = v_tenant_id and nv.version = ov.version
  where nt.tenant_id = v_tenant_id
    and ot.tenant_id = v_template_id
    and nt.key = ot.key
    and nv.template_id = nt.id;

  -- The calendar category vocabulary (#834). Copied for the same reason as the
  -- inventory categories above: a tenant with an empty vocabulary cannot tag a
  -- calendar item at all, and the keys are what the views and the app join on.
  -- The labels come from the template, so what the template calls its own
  -- events is what a new tenant starts with -- and the platform tenant calls
  -- them "Our events", not "Chatter events".
  insert into public.calendar_categories (tenant_id, key, label, sort_order, is_active)
  select v_tenant_id, c.key, c.label, c.sort_order, c.is_active
  from public.calendar_categories c
  where c.tenant_id = v_template_id;

  -- Platform-default settings: the approval thresholds, the content lead
  -- time and the fiscal year. Not the template's images, page visibility,
  -- branding or site content -- those are the template tenant's own.
  insert into public.app_settings (tenant_id, key, value)
  select v_tenant_id, s.key, s.value
  from public.app_settings s
  where s.tenant_id = v_template_id
    and (s.key like 'finance.%' or s.key like 'content.%' or s.key like 'org.%');

  -- The first admin: a staged grant claim_pending_role_grants() turns into
  -- the admin role -- and, through ensure_membership_for_role, the
  -- membership -- the first time that address signs in. The operator script
  -- mints the invite link.
  if nullif(btrim(coalesce(p_admin_email, '')), '') is not null then
    select r.id into v_admin_role_id
    from public.roles r
    where r.tenant_id = v_tenant_id and r.name = 'admin';

    insert into public.pending_role_grants (email, role_id)
    values (lower(btrim(p_admin_email)), v_admin_role_id);
  end if;

  return v_tenant_id;
end;
$$;

-- Every tenant that already exists, from the defaults for its own plan. The
-- resolution order would answer the same way without these rows, but only
-- because it fails open; the operator screen in the follow-up shows flags, and
-- a tenant with no rows would render as an empty page rather than as the full
-- product it actually has.
insert into public.tenant_modules (tenant_id, module_key, enabled)
select t.id, pm.module_key, pm.enabled
from public.tenants t
join public.plan_modules pm on pm.plan = t.plan
on conflict (tenant_id, module_key) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Isolation self-check (20260906100000)
-- ---------------------------------------------------------------------------

-- tenant_modules is the first new tenant table here. Its select policy carries
-- the tenant predicate, and its only foreign key to a tenant table points at
-- `tenants`, which carries no tenant_id of its own and so is not one -- a
-- single-column reference there does not trip the composite-FK rule. `modules`
-- and `plan_modules` are global and carry no tenant_id at all. All of which is
-- the argument; this is the check.
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
