-- #834: the calendar taxonomy stops being Chatter Snow's.
--
-- `calendar_item_categories.category` was `text check (category in (...))` with
-- six values baked into the constraint, one of them `chatter_events`, and the
-- labels were hardcoded in two `calendar-shared.tsx` files. So every tenant
-- provisioned since #707 got a category named after another organization -- and
-- not only in the portal. `/events/community` renders the whole list as a
-- filter dropdown, `events` is `defaultVisible: true`, so a customer's *public*
-- site offered visitors "Chatter events", "LGBTQ+ community" and "Winter &
-- outdoor sports" from the day they were provisioned. #825 removed the category
-- badges from that page as internal taxonomy but deliberately kept the filter.
--
-- The vocabulary becomes a tenant-scoped catalog, the same shape as
-- `inventory_categories` (20260904150000) and `agenda_templates`: seeded with a
-- starter set, copied to a new tenant by provision_tenant(), and editable
-- afterwards. An organization words its own calendar, including what it calls
-- its own events.
--
-- `key` stays platform vocabulary and `label` becomes tenant vocabulary. The
-- views below and `EVENT_CATEGORY` in src join on the key, so it has to be
-- stable across tenants; the label is the only part anyone reads, so it is the
-- part that has to be theirs. That is why `chatter_events` is renamed to
-- `own_events` for everyone rather than left alone for Chatter Snow: the key is
-- an identifier the platform owns, and Chatter Snow keeps the words by keeping
-- the label "Chatter events".
--
-- The same rename applies to the `chatter_event` *item_type*, a second
-- Chatter-named vocabulary on the same rows. It is internal since #825 dropped
-- the type badges from the public page, so it is renamed rather than made
-- per-tenant -- one axis of this taxonomy is the tenant's to word, the other is
-- the platform's to define.

-- ---------------------------------------------------------------------------
-- 1. The catalog
-- ---------------------------------------------------------------------------

create table public.calendar_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  key text not null check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  label text not null check (btrim(label) <> ''),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Nullable, unlike volunteer_role_types: the seed below runs inside this
  -- migration, where there is no authenticated user to attribute it to.
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  -- The target of the composite foreign keys added in section 3.
  unique (tenant_id, key)
);

comment on table public.calendar_categories is
  'Per-tenant community-calendar category vocabulary (#834). `key` is the stable identifier the views and app code join on; `label` is the tenant''s own wording and the only part anyone reads.';

create index calendar_categories_tenant_id_idx on public.calendar_categories (tenant_id);

alter table public.calendar_categories enable row level security;

-- Reuses the existing `content_calendar` resource rather than adding one.
-- Select is open to any signed-in member of the tenant, the same shape the
-- inventory vocabulary has: every screen rendering a calendar item resolves its
-- category labels, and a label is not sensitive. Editing is
-- content_calendar:manage.
--
-- Every policy carries `tenant_id = current_tenant_id()`, including select.
-- `using (true)` would read as harmless for a label, but tenant_isolation_gaps()
-- rejects it and is right to: a vocabulary is a list of what an organization
-- runs programs about, and one tenant enumerating another's is a leak whether
-- or not any single row is secret.
create policy "calendar_categories select" on public.calendar_categories for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
create policy "calendar_categories insert" on public.calendar_categories for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()) and public.has_permission('content_calendar', 'manage'));
create policy "calendar_categories update" on public.calendar_categories for update to authenticated
  using (tenant_id = (select public.current_tenant_id()) and public.has_permission('content_calendar', 'manage'))
  with check (tenant_id = (select public.current_tenant_id()) and public.has_permission('content_calendar', 'manage'));
create policy "calendar_categories delete" on public.calendar_categories for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()) and public.has_permission('content_calendar', 'manage'));

grant select, insert, update, delete on public.calendar_categories to authenticated;

create trigger set_updated_at before update on public.calendar_categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Seed every existing tenant with the current vocabulary
-- ---------------------------------------------------------------------------

-- Chatter Snow keeps its words -- `own_events` is labelled "Chatter events"
-- there, so nothing on chattersnow.org changes. Every other tenant, including
-- the platform tenant that provision_tenant() templates from, gets "Our
-- events", which is what a newly provisioned organization will now inherit.
insert into public.calendar_categories (tenant_id, key, label, sort_order)
select
  t.id,
  v.key,
  case
    when v.key = 'own_events' and t.slug = 'chatter-snow' then 'Chatter events'
    else v.label
  end,
  v.sort_order
from public.tenants t
cross join (values
  ('lgbtq_community', 'LGBTQ+ community', 10),
  ('winter_outdoor_sports', 'Winter & outdoor sports', 20),
  ('community_social_justice', 'Community & social justice', 30),
  ('own_events', 'Our events', 40),
  ('campaigns_fundraising', 'Campaigns & fundraising', 50),
  ('partner_opportunities', 'Partner opportunities', 60)
) as v(key, label, sort_order)
on conflict (tenant_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Point the item rows at the catalog
-- ---------------------------------------------------------------------------

update public.calendar_item_categories set category = 'own_events'
where category = 'chatter_events';

update public.calendar_program_suggestion_rules set category = 'own_events'
where category = 'chatter_events';

alter table public.calendar_item_categories
  drop constraint calendar_item_categories_category_check;

alter table public.calendar_item_categories
  add constraint calendar_item_categories_category_fkey
  foreign key (tenant_id, category)
  references public.calendar_categories (tenant_id, key)
  on update cascade;

alter table public.calendar_program_suggestion_rules
  drop constraint calendar_program_suggestion_rules_category_check;

-- Nullable: a rule may match on item_type alone, and a foreign key ignores nulls.
alter table public.calendar_program_suggestion_rules
  add constraint calendar_program_suggestion_rules_category_fkey
  foreign key (tenant_id, category)
  references public.calendar_categories (tenant_id, key)
  on update cascade;

-- ---------------------------------------------------------------------------
-- 4. The item_type rename
-- ---------------------------------------------------------------------------

update public.calendar_items set item_type = 'own_event' where item_type = 'chatter_event';
update public.calendar_program_suggestion_rules set item_type = 'own_event' where item_type = 'chatter_event';

alter table public.calendar_items drop constraint calendar_items_item_type_check;
alter table public.calendar_items add constraint calendar_items_item_type_check
  check (item_type in (
    'own_event', 'partner_event', 'community_observance',
    'heritage_social_justice_moment', 'winter_outdoor_sports_moment',
    'content_campaign', 'fundraiser', 'partner_opportunity', 'content_opportunity'
  ));

alter table public.calendar_program_suggestion_rules drop constraint calendar_program_suggestion_rules_item_type_check;
alter table public.calendar_program_suggestion_rules add constraint calendar_program_suggestion_rules_item_type_check
  check (item_type in (
    'own_event', 'partner_event', 'community_observance',
    'heritage_social_justice_moment', 'winter_outdoor_sports_moment',
    'content_campaign', 'fundraiser', 'partner_opportunity', 'content_opportunity'
  ));

-- ---------------------------------------------------------------------------
-- 5. Views
-- ---------------------------------------------------------------------------

-- Unchanged from 20260906060000 except the two renamed literals.
create or replace view public.public_calendar_items as
select
  ci.id,
  ci.title,
  ci.item_type,
  ci.starts_at,
  ci.ends_at,
  ci.time_zone,
  ci.summary,
  (select array_agg(c.category) from public.calendar_item_categories c where c.item_id = ci.id) as categories,
  ci.public_url
from public.calendar_items ci
where ci.visibility = 'public'
  and ci.calendar_status in ('active', 'complete')
  and ci.tenant_id = public.public_tenant_id()
union all
select
  e.id,
  e.name as title,
  'own_event' as item_type,
  e.starts_at,
  e.ends_at,
  e.timezone as time_zone,
  e.description as summary,
  array['own_events'] as categories,
  '/events/' || e.id::text as public_url
from public.events e
where e.visibility = 'public'
  and e.status = 'published'
  and e.tenant_id = public.public_tenant_id();

-- The public community calendar's filter used to render a hardcoded list, which
-- is how one tenant's wording reached every tenant's visitors. It reads this
-- instead: the resolved tenant's own active vocabulary, and nothing else.
-- Not security_invoker, matching every other public_* view: the table's RLS
-- grants select to `authenticated` only, so an invoker-rights view would return
-- nothing to the anonymous visitor this exists for. The tenant scoping is done
-- here, by public_tenant_id(), exactly as public_calendar_items does it.
create or replace view public.public_calendar_categories as
select c.key, c.label, c.sort_order
from public.calendar_categories c
where c.is_active
  and c.tenant_id = public.public_tenant_id();

comment on view public.public_calendar_categories is
  'The resolved tenant''s active calendar categories, for the public community calendar filter (#834).';

grant select on public.public_calendar_categories to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Provisioning copies the vocabulary
-- ---------------------------------------------------------------------------
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