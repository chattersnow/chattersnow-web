-- Data-driven permissions (spec §5.3/§6, issue #16): a `resources` catalog
-- and a `role_permissions` matrix (role x resource -> none/view/manage) that
-- replace the hardcoded has_role('admin') / has_role('event_coordinator') /
-- etc. checks baked into RLS policies and route guards. Administration >
-- Permissions edits this matrix directly.
--
-- Resource granularity mostly matches the entitlement matrix rows in
-- docs/technical-spec.md §5.3, with two differences from a literal 1:1
-- mapping:
--   1. A handful of existing RLS policies already grant narrower per-verb
--      access than a flat view/manage split can express on its own — e.g.
--      volunteer can insert a donation-intake/distribution record but can't
--      read the People directory or Inventory reports. Rather than widen
--      those roles to a full "manage" (which would grant read/delete access
--      the entitlement matrix explicitly withholds), those carve-outs get
--      their own narrow "Workflow" resources (people_intake, inventory_intake,
--      volunteer_hours_logging) that RLS policies OR together with the
--      broader resource's manage level. This preserves exact current access.
--   2. Sections with no implemented tables/routes yet (Programs, Impact
--      tracking, Finance approvals) are left out of the resource catalog for
--      now rather than added as inert rows; add them when those sections are
--      built.

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  section text not null,
  label text not null,
  description text,
  sort_order integer not null default 0
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  level text not null default 'none' check (level in ('none', 'view', 'manage')),
  unique (role_id, resource_id)
);

create function public.permission_rank(p_level text)
returns smallint
language sql
immutable
as $$
  select case p_level when 'manage' then 2 when 'view' then 1 else 0 end;
$$;

-- security definer + owned by the migration role so this bypasses RLS on
-- role_permissions/resources themselves (same recursive-policy-avoidance
-- reason as has_role/is_admin/my_roles in 20260821080000).
create function public.has_permission(p_resource_key text, p_min_level text)
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
  where ur.user_id = auth.uid() and res.key = p_resource_key;
$$;

-- Redefine is_admin() to be data-driven (administration resource, manage
-- level) instead of hardcoding the 'admin' role name, per issue #16. Every
-- existing caller (list_portal_users, RLS on roles/user_roles/resources/
-- role_permissions) picks up the new behavior automatically.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_permission('administration', 'manage');
$$;

-- Used by the app (analogous to my_roles) to build a resource -> level map
-- for nav filtering and route guards without a round trip per resource.
create function public.my_permissions()
returns table (resource_key text, level text)
language sql
security definer
set search_path = public
stable
as $$
  select res.key, coalesce(
    (select rp.level
     from public.user_roles ur
     join public.role_permissions rp on rp.role_id = ur.role_id and rp.resource_id = res.id
     where ur.user_id = auth.uid()
     order by public.permission_rank(rp.level) desc
     limit 1),
    'none'
  )
  from public.resources res
  order by res.sort_order, res.key;
$$;

grant execute on function public.permission_rank(text) to authenticated;
grant execute on function public.has_permission(text, text) to authenticated;
grant execute on function public.my_permissions() to authenticated;

alter table public.resources enable row level security;
alter table public.role_permissions enable row level security;

create policy "authenticated read resources" on public.resources
  for select to authenticated using (true);
create policy "admin manage resources" on public.resources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read role_permissions" on public.role_permissions
  for select to authenticated using (true);
create policy "admin manage role_permissions" on public.role_permissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.resources to authenticated;
grant insert, update, delete on public.resources to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;

-- Roles are no longer limited to the initial five; Administration >
-- Permissions can create new ones. Find and drop the check constraint
-- regardless of its auto-generated name.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.roles'::regclass and contype = 'c';

  if v_constraint_name is not null then
    execute format('alter table public.roles drop constraint %I', v_constraint_name);
  end if;
end $$;

insert into public.resources (key, section, label, description, sort_order) values
  ('events', 'Events', 'Events', 'Event details, sponsors, giveaway, attendance, logistics, and volunteer sign-up', 10),
  ('event_expenses', 'Events', 'Event expenses', 'Event-level expense records', 20),
  ('event_incidents', 'Events', 'Incident reports', 'Sensitive event incident and problem documentation', 30),
  ('event_volunteer_hours', 'Events', 'Volunteer hours', 'Hours logged against an event', 40),
  ('inventory', 'Inventory', 'Items & distribution', 'Inventory item catalog, donation intake, and distribution management', 50),
  ('inventory_reports', 'Inventory', 'Inventory reports', 'Inventory valuation and reporting', 60),
  ('finance', 'Finance', 'Finance', 'Donations, expenses, and reimbursements management', 70),
  ('finance_reports', 'Finance', 'Finance reports', 'Financial reports and oversight', 80),
  ('people', 'People', 'People directory', 'Donor, sponsor, and volunteer contact directory', 90),
  ('volunteers', 'Volunteers', 'Volunteers', 'Volunteer role types and participation tracking', 100),
  ('governance', 'Governance', 'Governance', 'Board, meetings, bylaws, policies, and compliance records', 110),
  ('administration', 'Administration', 'Administration', 'Users, permissions, settings, and audit log', 120),
  ('people_intake', 'Workflow', 'Inline contact creation', 'Create a People record inline from an event or donation form, without full People directory access', 130),
  ('inventory_intake', 'Workflow', 'Donation intake & distribution', 'Record donation intake and distribution transactions, without Inventory catalog or reports access', 140),
  ('volunteer_hours_logging', 'Workflow', 'Log own volunteer hours', 'Log hours against an event without editing others'' entries', 150);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'events', 'manage'),
  ('admin', 'event_expenses', 'manage'),
  ('admin', 'event_incidents', 'manage'),
  ('admin', 'event_volunteer_hours', 'manage'),
  ('admin', 'inventory', 'manage'),
  ('admin', 'inventory_reports', 'manage'),
  ('admin', 'finance', 'manage'),
  ('admin', 'finance_reports', 'manage'),
  ('admin', 'people', 'manage'),
  ('admin', 'volunteers', 'manage'),
  ('admin', 'governance', 'manage'),
  ('admin', 'administration', 'manage'),
  ('admin', 'people_intake', 'manage'),
  ('admin', 'inventory_intake', 'manage'),
  ('admin', 'volunteer_hours_logging', 'manage'),

  ('event_coordinator', 'events', 'manage'),
  ('event_coordinator', 'event_expenses', 'manage'),
  ('event_coordinator', 'event_incidents', 'manage'),
  ('event_coordinator', 'event_volunteer_hours', 'manage'),
  ('event_coordinator', 'inventory', 'none'),
  ('event_coordinator', 'inventory_reports', 'none'),
  ('event_coordinator', 'finance', 'none'),
  ('event_coordinator', 'finance_reports', 'none'),
  ('event_coordinator', 'people', 'view'),
  ('event_coordinator', 'volunteers', 'view'),
  ('event_coordinator', 'governance', 'none'),
  ('event_coordinator', 'administration', 'none'),
  ('event_coordinator', 'people_intake', 'manage'),
  ('event_coordinator', 'inventory_intake', 'none'),
  ('event_coordinator', 'volunteer_hours_logging', 'none'),

  ('finance', 'events', 'view'),
  ('finance', 'event_expenses', 'manage'),
  ('finance', 'event_incidents', 'none'),
  ('finance', 'event_volunteer_hours', 'view'),
  ('finance', 'inventory', 'none'),
  ('finance', 'inventory_reports', 'view'),
  ('finance', 'finance', 'manage'),
  ('finance', 'finance_reports', 'view'),
  ('finance', 'people', 'view'),
  ('finance', 'volunteers', 'none'),
  ('finance', 'governance', 'none'),
  ('finance', 'administration', 'none'),
  ('finance', 'people_intake', 'none'),
  ('finance', 'inventory_intake', 'none'),
  ('finance', 'volunteer_hours_logging', 'none'),

  ('board', 'events', 'none'),
  ('board', 'event_expenses', 'none'),
  ('board', 'event_incidents', 'none'),
  ('board', 'event_volunteer_hours', 'none'),
  ('board', 'inventory', 'none'),
  ('board', 'inventory_reports', 'none'),
  ('board', 'finance', 'none'),
  ('board', 'finance_reports', 'view'),
  ('board', 'people', 'none'),
  ('board', 'volunteers', 'none'),
  ('board', 'governance', 'manage'),
  ('board', 'administration', 'none'),
  ('board', 'people_intake', 'none'),
  ('board', 'inventory_intake', 'none'),
  ('board', 'volunteer_hours_logging', 'none'),

  ('volunteer', 'events', 'view'),
  ('volunteer', 'event_expenses', 'none'),
  ('volunteer', 'event_incidents', 'none'),
  ('volunteer', 'event_volunteer_hours', 'view'),
  ('volunteer', 'inventory', 'none'),
  ('volunteer', 'inventory_reports', 'none'),
  ('volunteer', 'finance', 'none'),
  ('volunteer', 'finance_reports', 'none'),
  ('volunteer', 'people', 'none'),
  ('volunteer', 'volunteers', 'view'),
  ('volunteer', 'governance', 'none'),
  ('volunteer', 'administration', 'none'),
  ('volunteer', 'people_intake', 'manage'),
  ('volunteer', 'inventory_intake', 'manage'),
  ('volunteer', 'volunteer_hours_logging', 'manage')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;
