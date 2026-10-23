-- #1686 (part of #1685): per-event access for guests. The schema and the
-- functions; no existing RLS policy changes here -- that is #1687.
--
-- Today a person reaches an event through a role: `events: manage` reaches
-- every event in the tenant. A partner organization's coordinator needs one
-- event and nothing else. They become a GUEST in the tenant: a normal account
-- with a membership and no role, holding per-event grants.
--
-- AREAS. A grant is scoped to areas of the event, which are finer than the
-- permission resources -- `events` alone covers details, staff, registrations,
-- sponsors, discount codes and the giveaway. The platform defines them:
-- `event_access_areas` lists them, and `event_access_area_tables` puts every
-- event-scoped table in exactly one area and names the permission resource
-- its policies use today. Goods and money are `sensitive`.
--
-- OFFERED AREAS. Each tenant chooses which areas its grants may offer:
-- `app_settings` key `event_access.offered_areas`, a JSON array of area keys.
-- Absent means the platform default, the non-sensitive areas. Not an `org.%`
-- key on purpose: provision_tenant() copies those, and a new organization
-- should start from the platform default, not from its template's choice.
-- A grant may only gain an area its tenant offers; an area the tenant later
-- stops offering stays on the grant but reaches nothing until it is offered
-- again.
--
-- GRANTS. `event_access_grants`: one row per (event, user), a level
-- (`view` / `manage`) and a set of areas. No expiry: a grant lasts until it is
-- deleted, and the audit log keeps the history. Only `administration: manage`
-- writes them -- `events: manage` is not enough -- and `event_lead_id` grants
-- nothing. A grant gives its user a membership in the tenant (docs/tenants.md:
-- "a membership follows a role or an explicit grant"), since current_tenant_id()
-- is membership-based and a guest has no role to bring one.
--
-- has_event_access(event, table, level) is what #1687's policies will call: the
-- table's own has_permission() check, OR a grant on that event whose areas
-- cover the table and are offered by the tenant. It never widens
-- has_permission() itself. It takes the TABLE rather than the resource key
-- because one resource spans several areas; the area map supplies the resource.

-- ---------------------------------------------------------------------------
-- 1. The area catalog (platform-wide)
-- ---------------------------------------------------------------------------

create table public.event_access_areas (
  key text primary key,
  label text not null,
  description text not null,
  sensitive boolean not null,
  sort_order integer not null
);

comment on table public.event_access_areas is
  'The platform-defined areas a per-event access grant can cover (#1686). Sensitive areas (goods and money) are off unless a tenant offers them in event_access.offered_areas.';

insert into public.event_access_areas (key, label, description, sensitive, sort_order) values
  ('details', 'Details & logistics', 'The event itself, its logistics, checklist and programs.', false, 10),
  ('staff', 'Staff, volunteers & shifts', 'Who is working the event, shifts and volunteer hours.', false, 20),
  ('registrations', 'Registrations', 'Registrations, their questions and options, and carpools.', false, 30),
  ('media', 'Media', 'The event''s photos and upload links.', false, 40),
  ('impact', 'Impact & retro', 'Impact notes and the retro.', false, 50),
  ('expenses', 'Expenses', 'The event''s expenses.', true, 60),
  ('revenue', 'Revenue', 'Revenue, sales and monetary donations on the event.', true, 70),
  ('sponsors', 'Sponsors & pricing', 'Sponsors and discount codes.', true, 80),
  ('goods', 'Giveaway & goods', 'The giveaway, its prizes and winners, inventory movements and in-kind donations.', true, 90),
  ('incidents', 'Incidents', 'Incident reports from the event.', true, 100);

create table public.event_access_area_tables (
  table_name text primary key,
  area_key text not null references public.event_access_areas (key),
  resource_key text not null references public.resources (key)
);

comment on table public.event_access_area_tables is
  'Which area each event-scoped table belongs to, and the permission resource its policies check today (#1686). has_event_access() reads it. A table missing from it is reachable by role only.';

-- Where a policy checks more than one resource today (volunteer_hours,
-- donations, inventory_movements), this names the event-facing one; #1687
-- keeps the others beside has_event_access(). Not mapped on purpose:
-- artwork_submissions and event_artwork_calls (their own module),
-- conduct_reports (confidential), governance_meetings, reimbursements,
-- inventory_distribution_drafts (owner-only), event_carpool_assignment_emails
-- (no policies). Option prices live on event_registration_options and #1685
-- puts them under Sponsors & pricing; that is a column, which #1687/#1688
-- handle, so the table stays with Registrations.
insert into public.event_access_area_tables (table_name, area_key, resource_key) values
  ('events', 'details', 'events'),
  ('event_logistics', 'details', 'events'),
  ('event_checklist_items', 'details', 'events'),
  ('event_programs', 'details', 'events'),
  ('event_staff', 'staff', 'events'),
  ('event_volunteers', 'staff', 'events'),
  ('event_shifts', 'staff', 'events'),
  ('volunteer_hours', 'staff', 'event_volunteer_hours'),
  ('volunteer_hour_submissions', 'staff', 'volunteers'),
  ('event_registrations', 'registrations', 'events'),
  ('event_registration_questions', 'registrations', 'events'),
  ('event_registration_options', 'registrations', 'events'),
  ('event_carpool_cars', 'registrations', 'events'),
  ('event_carpool_passengers', 'registrations', 'events'),
  ('event_media', 'media', 'events'),
  ('event_media_upload_links', 'media', 'events'),
  ('event_impact_notes', 'impact', 'event_impact'),
  ('event_retro_items', 'impact', 'events'),
  ('event_expenses', 'expenses', 'event_expenses'),
  ('event_revenue', 'revenue', 'event_revenue'),
  ('sales', 'revenue', 'sales'),
  ('monetary_donations', 'revenue', 'finance'),
  ('event_sponsors', 'sponsors', 'events'),
  ('discount_codes', 'sponsors', 'events'),
  ('giveaways', 'goods', 'events'),
  ('giveaway_buckets', 'goods', 'events'),
  ('giveaway_prizes', 'goods', 'events'),
  ('giveaway_rules', 'goods', 'events'),
  ('giveaway_rules_versions', 'goods', 'events'),
  ('giveaway_ticket_grants', 'goods', 'events'),
  ('giveaway_ticket_packages', 'goods', 'events'),
  ('giveaway_ticket_sales', 'goods', 'events'),
  ('giveaway_tier_grants', 'goods', 'events'),
  ('giveaway_tier_rules', 'goods', 'events'),
  ('giveaway_tiers', 'goods', 'events'),
  ('giveaway_winners', 'goods', 'events'),
  ('inventory_movements', 'goods', 'inventory'),
  ('donations', 'goods', 'finance'),
  ('event_incidents', 'incidents', 'event_incidents');

-- A misspelt table would silently reach nothing; refuse to leave one behind.
do $$
declare
  v_missing text;
begin
  select string_agg(table_name, ', ') into v_missing
    from public.event_access_area_tables
   where to_regclass('public.' || table_name) is null;
  if v_missing is not null then
    raise exception 'event_access_area_tables names tables that do not exist: %', v_missing;
  end if;
end;
$$;

alter table public.event_access_areas enable row level security;
alter table public.event_access_area_tables enable row level security;
revoke all on public.event_access_areas, public.event_access_area_tables
  from public, anon, authenticated;
grant select on public.event_access_areas, public.event_access_area_tables
  to authenticated;

-- Platform catalog, like `resources`: every signed-in account may read it.
create policy "event_access_areas select" on public.event_access_areas
  for select to authenticated using (true);
create policy "event_access_area_tables select" on public.event_access_area_tables
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 2. The tenant's offered areas
-- ---------------------------------------------------------------------------

-- The current tenant's offered areas, in catalog order. Unknown keys in the
-- setting are dropped; an unreadable setting (not an array) means the default
-- rather than an error, so a bad value can never take the events pages down.
create function public.event_access_offered_areas()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  with setting as (
    select s.value
      from public.app_settings s
     where s.tenant_id = (select public.current_tenant_id())
       and s.key = 'event_access.offered_areas'
       and jsonb_typeof(s.value) = 'array'
  )
  select coalesce(array_agg(a.key order by a.sort_order), '{}')
    from public.event_access_areas a
   where case
     when exists (select 1 from setting)
     then (select setting.value from setting) ? a.key
     else not a.sensitive
   end;
$$;

comment on function public.event_access_offered_areas() is
  'The areas the current tenant''s per-event grants may cover (#1686): app_settings event_access.offered_areas, or the non-sensitive areas when the tenant has not chosen.';

revoke all on function public.event_access_offered_areas() from public, anon;
grant execute on function public.event_access_offered_areas() to authenticated;

-- Chatter Snow, seeded with the default, as #1686 asks: its choice stays put
-- if the platform default ever changes. Scoped by slug like 20260923010000; a
-- no-op where there is no `chatter-snow` tenant. Triggers off for the same
-- reason as there: no person made this change.
alter table public.app_settings
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.app_settings (tenant_id, key, value)
select tenant.id, 'event_access.offered_areas',
       (select jsonb_agg(a.key order by a.sort_order)
          from public.event_access_areas a
         where not a.sensitive)
from tenant
on conflict (tenant_id, key) do nothing;

alter table public.app_settings
  enable trigger set_updated_at,
  enable trigger audit_log_row;

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------

create table public.event_access_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  level text not null
    constraint event_access_grants_level_check check (level in ('view', 'manage')),
  areas text[] not null
    constraint event_access_grants_areas_check check (cardinality(areas) > 0),
  granted_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint event_access_grants_event_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade,
  constraint event_access_grants_event_user_key unique (tenant_id, event_id, user_id)
);

comment on table public.event_access_grants is
  'A per-event access grant (#1686): one user, one event, a level and the areas it covers. Lasts until deleted. Written only by administration: manage; read by those and by the grantee. has_event_access() reads it.';

create index event_access_grants_user_idx on public.event_access_grants (user_id, tenant_id);
create index event_access_grants_event_idx on public.event_access_grants (event_id);

-- Areas must be known and distinct, and a grant may only GAIN an area its
-- tenant offers now. An area already on the grant may stay when the tenant
-- stops offering it, so changing a grant's level never trips over it.
create function public.event_access_grants_check_areas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offered text[];
begin
  if exists (
    select 1 from unnest(new.areas) a(key)
     where not exists (select 1 from public.event_access_areas x where x.key = a.key)
  ) then
    raise exception 'EVENT_ACCESS_AREA_UNKNOWN';
  end if;

  if cardinality(new.areas) <> (select count(distinct a) from unnest(new.areas) a) then
    raise exception 'EVENT_ACCESS_AREA_DUPLICATE';
  end if;

  -- The tenant's own offer, not the session's: a grant is checked against the
  -- tenant it belongs to.
  select coalesce(
    (select array(select jsonb_array_elements_text(s.value))
       from public.app_settings s
      where s.tenant_id = new.tenant_id
        and s.key = 'event_access.offered_areas'
        and jsonb_typeof(s.value) = 'array'),
    (select array_agg(a.key) from public.event_access_areas a where not a.sensitive)
  ) into v_offered;

  if exists (
    select 1 from unnest(new.areas) a(key)
     where not (a.key = any (v_offered))
       and (tg_op = 'INSERT' or not (a.key = any (old.areas)))
  ) then
    raise exception 'EVENT_ACCESS_AREA_NOT_OFFERED';
  end if;

  return new;
end;
$$;

create trigger event_access_grants_check_areas
  before insert or update of areas on public.event_access_grants
  for each row execute function public.event_access_grants_check_areas();

-- A grant is the explicit act that gives a guest a membership. Revoking the
-- last grant leaves it: removing a membership is Administration > Users' job.
create function public.ensure_membership_for_event_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_memberships (user_id, tenant_id, kind, created_by)
  values (new.user_id, new.tenant_id, 'member', new.created_by)
  on conflict (user_id, tenant_id) do nothing;
  return new;
end;
$$;

create trigger ensure_membership_for_event_access
  after insert on public.event_access_grants
  for each row execute function public.ensure_membership_for_event_access();

create trigger set_updated_at
  before update on public.event_access_grants
  for each row execute function public.set_updated_at();

alter table public.event_access_grants enable row level security;
revoke all on public.event_access_grants from public, anon, authenticated;
grant select, insert, update, delete on public.event_access_grants to authenticated;

create policy "event_access_grants select" on public.event_access_grants
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (user_id = (select auth.uid()) or public.has_permission('administration', 'manage'))
  );

create policy "event_access_grants insert" on public.event_access_grants
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

create policy "event_access_grants update" on public.event_access_grants
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

create policy "event_access_grants delete" on public.event_access_grants
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

insert into public.audited_tables (table_name, pk_column) values
  ('event_access_grants', 'id');

create trigger audit_log_row after insert or update or delete
  on public.event_access_grants
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 4. The checks
-- ---------------------------------------------------------------------------

-- The caller's rank (0 none, 1 view, 2 manage) on one event-scoped table of
-- one event: the greater of their role's level on the table's resource and an
-- applicable grant. A grant applies when it is the caller's, on that event, in
-- the current tenant, covers the table's area, and that area is offered; and
-- like has_permission(), only when the account is not deactivated and the
-- resource's module is enabled for the tenant. Unmapped table: role only.
create function public.event_access_rank(p_event_id uuid, p_table_name text)
returns smallint
language sql
security definer
set search_path = public
stable
as $$
  select greatest(
    (select case
       when public.has_permission(m.resource_key, 'manage') then 2
       when public.has_permission(m.resource_key, 'view') then 1
       else 0
     end
       from public.event_access_area_tables m
      where m.table_name = p_table_name),
    (select max(public.permission_rank(g.level))
       from public.event_access_area_tables m
       join public.resources res on res.key = m.resource_key
       join public.event_access_grants g
         on g.event_id = p_event_id
        and g.user_id = auth.uid()
        and g.tenant_id = (select public.current_tenant_id())
        and m.area_key = any (g.areas)
      where m.table_name = p_table_name
        and m.area_key = any (public.event_access_offered_areas())
        and not exists (
          select 1 from public.deactivated_users du where du.user_id = auth.uid()
        )
        and public.module_enabled_for_tenant(g.tenant_id, res.module_key) is not false),
    0
  )::smallint;
$$;

revoke all on function public.event_access_rank(uuid, text) from public, anon, authenticated;

create function public.has_event_access(p_event_id uuid, p_table_name text, p_min_level text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.event_access_rank(p_event_id, p_table_name) >= public.permission_rank(p_min_level)
     and public.permission_rank(p_min_level) > 0;
$$;

comment on function public.has_event_access(uuid, text, text) is
  'Whether the caller reaches one event-scoped table of one event at p_min_level (#1686): has_permission() on the table''s resource (event_access_area_tables), OR an event_access_grants row of theirs on that event, in the current tenant, whose areas cover the table and are offered by the tenant -- respecting deactivated_users and module entitlements like has_permission(). Never widens has_permission(). For #1687''s event-scoped RLS policies.';

revoke all on function public.has_event_access(uuid, text, text) from public, anon;
grant execute on function public.has_event_access(uuid, text, text) to authenticated;

-- The caller's effective level per area on one event, for the portal; mirrors
-- my_permissions(). An area's level is the highest over its tables, so an area
-- shows when anything in it can be read. 'none' everywhere for an event that
-- is not in the current tenant.
create function public.my_event_access(p_event_id uuid)
returns table (area_key text, level text)
language sql
security definer
set search_path = public
stable
as $$
  select a.key,
         case coalesce(max(public.event_access_rank(p_event_id, m.table_name)), 0)
           when 2 then 'manage'
           when 1 then 'view'
           else 'none'
         end
    from public.event_access_areas a
    left join public.event_access_area_tables m
      on m.area_key = a.key
     and exists (
       select 1 from public.events e
        where e.id = p_event_id
          and e.tenant_id = (select public.current_tenant_id())
     )
   group by a.key, a.sort_order
   order by a.sort_order;
$$;

comment on function public.my_event_access(uuid) is
  'The caller''s effective level (none/view/manage) per event access area on one event of the current tenant (#1686): role permissions and their own grants together, as has_event_access() decides them. For the portal; mirrors my_permissions().';

revoke all on function public.my_event_access(uuid) from public, anon;
grant execute on function public.my_event_access(uuid) to authenticated;

-- The events the caller holds a grant on, for a guest's events list: the
-- grant's level and the areas of it the tenant offers now. A grant whose
-- areas are all withdrawn is left out, as is everything for a deactivated
-- account.
create function public.my_granted_events()
returns table (event_id uuid, level text, areas text[])
language sql
security definer
set search_path = public
stable
as $$
  select g.event_id, g.level, offered.areas
    from public.event_access_grants g
    cross join lateral (
      select array_agg(a.key order by a.sort_order) as areas
        from public.event_access_areas a
       where a.key = any (g.areas)
         and a.key = any (public.event_access_offered_areas())
    ) offered
   where g.user_id = auth.uid()
     and g.tenant_id = (select public.current_tenant_id())
     and offered.areas is not null
     and not exists (
       select 1 from public.deactivated_users du where du.user_id = auth.uid()
     );
$$;

comment on function public.my_granted_events() is
  'The events the caller holds a per-event access grant on in the current tenant (#1686), with the grant''s level and the areas of it the tenant currently offers. Empty for a deactivated account.';

revoke all on function public.my_granted_events() from public, anon;
grant execute on function public.my_granted_events() to authenticated;
