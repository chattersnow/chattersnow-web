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

-- The checks come off *before* the data is rewritten. A check constraint is
-- enforced on every UPDATE, so setting a row to 'own_events' while the old
-- constraint still lists 'chatter_events' fails on that row -- which is exactly
-- what happened on the first push to the hosted project. It passed locally for
-- a reason worth naming: `db:reset` runs migrations against an empty database
-- and seeds afterwards, so the UPDATE matched nothing and the ordering never
-- mattered. Production has the observance calendar seeded by 20260826070000.
alter table public.calendar_item_categories
  drop constraint calendar_item_categories_category_check;

alter table public.calendar_program_suggestion_rules
  drop constraint calendar_program_suggestion_rules_category_check;

update public.calendar_item_categories set category = 'own_events'
where category = 'chatter_events';

update public.calendar_program_suggestion_rules set category = 'own_events'
where category = 'chatter_events';

alter table public.calendar_item_categories
  add constraint calendar_item_categories_category_fkey
  foreign key (tenant_id, category)
  references public.calendar_categories (tenant_id, key)
  on update cascade;

-- Nullable: a rule may match on item_type alone, and a foreign key ignores nulls.
alter table public.calendar_program_suggestion_rules
  add constraint calendar_program_suggestion_rules_category_fkey
  foreign key (tenant_id, category)
  references public.calendar_categories (tenant_id, key)
  on update cascade;

-- ---------------------------------------------------------------------------
-- 4. The item_type rename
-- ---------------------------------------------------------------------------

-- Drops before updates here too, for the same reason as section 3.
alter table public.calendar_items drop constraint calendar_items_item_type_check;
alter table public.calendar_program_suggestion_rules drop constraint calendar_program_suggestion_rules_item_type_check;

update public.calendar_items set item_type = 'own_event' where item_type = 'chatter_event';
update public.calendar_program_suggestion_rules set item_type = 'own_event' where item_type = 'chatter_event';

alter table public.calendar_items add constraint calendar_items_item_type_check
  check (item_type in (
    'own_event', 'partner_event', 'community_observance',
    'heritage_social_justice_moment', 'winter_outdoor_sports_moment',
    'content_campaign', 'fundraiser', 'partner_opportunity', 'content_opportunity'
  ));

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

-- ---------------------------------------------------------------------------
-- 7. The demo seeder follows the rename
-- ---------------------------------------------------------------------------

-- seed_demo_tenant() (20260907000000) tags one of its calendar items
-- `item_type = 'chatter_event'`, which section 4's constraint no longer accepts.
-- The function is already deployed, so editing that migration would change
-- nothing -- it has to be replaced here. Byte-for-byte the same body with that
-- one literal renamed.

create or replace function public.seed_demo_tenant(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t uuid := p_tenant_id;
  actor uuid := p_actor_user_id;
  v_plan text;
  tz text := 'America/Denver';

  p_rowan uuid; p_sasha uuid; p_ines uuid; p_dee uuid; p_kai uuid;
  p_marisol uuid; p_theo uuid; p_nadia uuid; p_quinn uuid; p_priya uuid;
  p_outfitters uuid; p_resort uuid; p_fund uuid;

  pr_library uuid; pr_clinic uuid; pr_pass uuid;
  ev_opener uuid; ev_fitting uuid; ev_social uuid; ev_tour uuid;
  don_outfitters uuid; don_priya uuid;
  inv_board uuid; inv_jacket uuid; inv_helmet uuid; inv_goggles uuid;
  inv_boots uuid; inv_pants uuid; inv_gloves uuid; inv_ticket uuid;
  gv uuid; tier_general uuid; tier_premium uuid; bucket_general uuid;
  mtg_past uuid; mtg_next uuid;
  vrt_greeter uuid; vrt_fitter uuid; vrt_lead uuid;
begin
  -- The guard that matters. Everything after it writes rows, so this is what
  -- makes "the reset job pointed at the wrong tenant" a failed transaction
  -- rather than a mess inside somebody's live data.
  select tn.plan into v_plan from public.tenants tn where tn.id = t;
  if v_plan is null then
    raise exception 'DEMO_TENANT_NOT_FOUND: %', t;
  end if;
  if v_plan <> 'demo' then
    raise exception 'DEMO_TENANT_REQUIRED: tenant % has plan %', t, v_plan;
  end if;

  -- auth.uid() is null here: this runs as service_role from a script with no
  -- session, and every created_by below is not-null.
  if p_actor_user_id is null or p_actor_person_id is null then
    raise exception 'DEMO_SEED_ACTOR_REQUIRED';
  end if;

  -- Seeding twice would double every list in the portal, and the reset job
  -- always builds a fresh tenant, so a second call is a mistake, not a
  -- refresh.
  if exists (select 1 from public.events e where e.tenant_id = t) then
    raise exception 'DEMO_TENANT_ALREADY_SEEDED: %', t;
  end if;

  -- Volunteer roles ----------------------------------------------------------
  insert into public.volunteer_role_types (tenant_id, name, description, is_public, created_by)
  values (t, 'Event greeter', 'Welcomes people at the door and runs the sign-in table.', true, actor)
  returning id into vrt_greeter;
  insert into public.volunteer_role_types (tenant_id, name, description, is_public, created_by)
  values (t, 'Gear fitter', 'Sizes boots, boards and outerwear at gear nights.', true, actor)
  returning id into vrt_fitter;
  insert into public.volunteer_role_types (tenant_id, name, description, is_public, created_by)
  values (t, 'Ride lead', 'Leads a group on the hill and keeps everyone together.', false, actor)
  returning id into vrt_lead;

  -- Programs -----------------------------------------------------------------
  insert into public.programs (tenant_id, name, description, status, created_by)
  values (t, 'Gear Library', 'Donated outerwear and hardgoods, lent out for a season at no cost.', 'active', actor)
  returning id into pr_library;
  insert into public.programs (tenant_id, name, description, status, created_by)
  values (t, 'First Turns', 'A beginner day on the hill: lesson, rental and a lift ticket, covered.', 'active', actor)
  returning id into pr_clinic;
  insert into public.programs (tenant_id, name, description, status, created_by)
  values (t, 'Season Pass Fund', 'Piloting a small number of subsidised season passes.', 'pilot', actor)
  returning id into pr_pass;

  -- People -------------------------------------------------------------------
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, notes, created_by)
  values (t, 'Rowan Adeyemi', 'individual', 'individual', 'rowan@demo.invalid', 'they/them', 'Board chair. Invented for the demo.', actor)
  returning id into p_rowan;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, notes, created_by)
  values (t, 'Sasha Petrova', 'individual', 'individual', 'sasha@demo.invalid', 'she/her', 'Treasurer. Invented for the demo.', actor)
  returning id into p_sasha;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, notes, created_by)
  values (t, 'Ines Okafor', 'individual', 'individual', 'ines@demo.invalid', 'she/her', 'Secretary. Invented for the demo.', actor)
  returning id into p_ines;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, riding_discipline, snowboard_experience_level, created_by)
  values (t, 'Dee Halvorsen', 'individual', 'individual', 'dee@demo.invalid', 'she/her', 'snowboard', 'advanced', actor)
  returning id into p_dee;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, riding_discipline, ski_experience_level, created_by)
  values (t, 'Kai Otsuka', 'individual', 'individual', 'kai@demo.invalid', 'he/him', 'ski', 'advanced', actor)
  returning id into p_kai;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, riding_discipline, snowboard_experience_level, created_by)
  values (t, 'Marisol Vega', 'individual', 'individual', 'marisol@demo.invalid', 'she/her', 'snowboard', 'beginner', actor)
  returning id into p_marisol;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, riding_discipline, ski_experience_level, created_by)
  values (t, 'Theo Brandt', 'individual', 'individual', 'theo@demo.invalid', 'he/him', 'ski', 'beginner', actor)
  returning id into p_theo;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, riding_discipline, ski_experience_level, snowboard_experience_level, created_by)
  values (t, 'Nadia Rahmani', 'individual', 'individual', 'nadia@demo.invalid', 'she/her', 'both', 'intermediate', 'beginner', actor)
  returning id into p_nadia;
  insert into public.people (tenant_id, name, source_type, person_type, email, pronouns, created_by)
  values (t, 'Quinn Sorensen', 'individual', 'individual', 'quinn@demo.invalid', 'they/them', actor)
  returning id into p_quinn;
  insert into public.people (tenant_id, name, source_type, person_type, email, created_by)
  values (t, 'Priya Raman', 'individual', 'individual', 'priya@demo.invalid', actor)
  returning id into p_priya;
  insert into public.people (tenant_id, name, source_type, person_type, email, website, notes, created_by)
  values (t, 'Northfork Outfitters', 'brand', 'organization', 'hello@demo.invalid', 'https://example.invalid', 'Gear donor. Invented for the demo.', actor)
  returning id into p_outfitters;
  insert into public.people (tenant_id, name, source_type, person_type, email, website, notes, created_by)
  values (t, 'Cedar Ridge Resort', 'organization', 'organization', 'partners@demo.invalid', 'https://example.invalid', 'Lift tickets and space. Invented for the demo.', actor)
  returning id into p_resort;
  insert into public.people (tenant_id, name, source_type, person_type, email, notes, created_by)
  values (t, 'Basin Community Fund', 'organization', 'organization', 'grants@demo.invalid', 'Small operating grant. Invented for the demo.', actor)
  returning id into p_fund;

  insert into public.person_role_tags (tenant_id, person_id, role, granted_by)
  values
    (t, p_rowan, 'staff', actor),
    (t, p_sasha, 'staff', actor),
    (t, p_ines, 'staff', actor),
    (t, p_dee, 'volunteer', actor),
    (t, p_kai, 'volunteer', actor),
    (t, p_marisol, 'attendee', actor),
    (t, p_theo, 'attendee', actor),
    (t, p_nadia, 'attendee', actor),
    (t, p_quinn, 'attendee', actor),
    (t, p_priya, 'donor', actor),
    (t, p_outfitters, 'donor', actor),
    (t, p_resort, 'sponsor', actor),
    (t, p_fund, 'partner', actor);

  insert into public.board_members (tenant_id, person_id, role_title, term_start, term_end, is_active, created_by)
  values
    (t, p_rowan, 'Chair', (now() - interval '14 months')::date, (now() + interval '10 months')::date, true, actor),
    (t, p_sasha, 'Treasurer', (now() - interval '14 months')::date, (now() + interval '10 months')::date, true, actor),
    (t, p_ines, 'Secretary', (now() - interval '2 months')::date, (now() + interval '22 months')::date, true, actor);

  -- Events -------------------------------------------------------------------
  insert into public.events (
    tenant_id, name, location, starts_at, ends_at, timezone, visibility, status,
    description, capacity, registration_enabled, attendance_count, budget_amount,
    event_lead_id, report_status, report_summary, lessons_learned,
    report_submitted_at, report_submitted_by, created_by
  )
  values (
    t, 'Season Opener Ride Day', 'Cedar Ridge Resort',
    now() - interval '42 days', now() - interval '42 days' + interval '8 hours', tz,
    'public', 'completed',
    'First group day of the season. Meet at the base area, ride in ability groups, eat together after.',
    60, true, 47, 2400.00, p_dee,
    'submitted',
    'Forty-seven people came out, twenty-two of them new to us. Ability groups worked; the sign-in table did not.',
    'Two greeters at the door next time, and print the roster the night before rather than the morning of.',
    now() - interval '35 days', actor, actor
  )
  returning id into ev_opener;

  insert into public.events (
    tenant_id, name, location, starts_at, ends_at, timezone, visibility, status,
    description, capacity, registration_enabled, registration_deadline,
    budget_amount, event_lead_id, created_by
  )
  values (
    t, 'Beginner Gear Fitting Night', 'Community room, second floor',
    now() + interval '19 days', now() + interval '19 days' + interval '3 hours', tz,
    'public', 'published',
    'Get fitted for boots, a board or skis, and outerwear from the gear library. No experience needed.',
    40, true, now() + interval '17 days', 600.00, p_kai, actor
  )
  returning id into ev_fitting;

  insert into public.events (
    tenant_id, name, location, starts_at, ends_at, timezone, visibility, status,
    description, capacity, registration_enabled, budget_amount, event_lead_id, created_by
  )
  values (
    t, 'Midwinter Social and Giveaway', 'The Annex',
    now() + interval '48 days', now() + interval '48 days' + interval '4 hours', tz,
    'public', 'published',
    'The one fundraiser of the season: food, a slideshow of the year so far, and a gear giveaway.',
    120, true, 1800.00, p_rowan, actor
  )
  returning id into ev_social;

  insert into public.events (
    tenant_id, name, starts_at, ends_at, timezone, visibility, status, description, created_by
  )
  values (
    t, 'Spring Splitboard Tour', now() + interval '96 days', now() + interval '96 days' + interval '9 hours', tz,
    'private', 'draft',
    'Still being scoped: the avalanche-safety requirement, group size and a backup date are all undecided.', actor
  )
  returning id into ev_tour;

  insert into public.event_programs (tenant_id, event_id, program_id)
  values
    (t, ev_opener, pr_clinic),
    (t, ev_fitting, pr_library),
    (t, ev_social, pr_pass),
    (t, ev_tour, pr_clinic);

  -- Registrations, checked in on the day that has already happened -----------
  insert into public.event_registrations (tenant_id, event_id, person_id, name, email, party_size, pronouns, checked_in_at, created_at)
  values
    (t, ev_opener, p_marisol, 'Marisol Vega', 'marisol@demo.invalid', 1, 'she/her', now() - interval '42 days' + interval '30 minutes', now() - interval '55 days'),
    (t, ev_opener, p_theo, 'Theo Brandt', 'theo@demo.invalid', 2, 'he/him', now() - interval '42 days' + interval '35 minutes', now() - interval '54 days'),
    (t, ev_opener, p_nadia, 'Nadia Rahmani', 'nadia@demo.invalid', 1, 'she/her', now() - interval '42 days' + interval '52 minutes', now() - interval '50 days'),
    (t, ev_opener, p_quinn, 'Quinn Sorensen', 'quinn@demo.invalid', 1, 'they/them', null, now() - interval '48 days'),
    (t, ev_opener, p_dee, 'Dee Halvorsen', 'dee@demo.invalid', 1, 'she/her', now() - interval '42 days' + interval '10 minutes', now() - interval '60 days');

  insert into public.event_registrations (tenant_id, event_id, person_id, name, email, party_size, pronouns, notes, created_at)
  values
    (t, ev_fitting, p_marisol, 'Marisol Vega', 'marisol@demo.invalid', 1, 'she/her', 'Needs boots, size 8.', now() - interval '6 days'),
    (t, ev_fitting, p_theo, 'Theo Brandt', 'theo@demo.invalid', 1, 'he/him', null, now() - interval '4 days'),
    (t, ev_fitting, p_quinn, 'Quinn Sorensen', 'quinn@demo.invalid', 2, 'they/them', 'Bringing a friend who is also new.', now() - interval '2 days');

  -- Donated gear, and where it went ------------------------------------------
  insert into public.donations (tenant_id, donor_id, donated_at, notes, created_by)
  values (t, p_outfitters, now() - interval '75 days', 'End-of-line stock from the shop. Invented for the demo.', actor)
  returning id into don_outfitters;
  insert into public.donations (tenant_id, donor_id, donated_at, notes, created_by)
  values (t, p_priya, now() - interval '30 days', 'Outgrown kids'' outerwear.', actor)
  returning id into don_priya;

  insert into public.inventory_items (tenant_id, donation_id, description, type, size, gender, condition, face_value, status, intended_use, created_by)
  values (t, don_outfitters, 'All-mountain snowboard, 152cm', 'snowboard', '152', 'unisex', 'like_new', 380.00, 'available', 'gear_library', actor)
  returning id into inv_board;
  insert into public.inventory_items (tenant_id, donation_id, description, type, size, gender, condition, face_value, status, intended_use, created_by)
  values (t, don_outfitters, 'Insulated shell jacket', 'jacket', 'M', 'unisex', 'new', 220.00, 'distributed', 'gear_library', actor)
  returning id into inv_jacket;
  insert into public.inventory_items (tenant_id, donation_id, description, type, size, condition, face_value, status, intended_use, created_by)
  values (t, don_outfitters, 'Snow helmet with adjustable fit', 'helmet', 'M', 'good', 90.00, 'available', 'gear_library', actor)
  returning id into inv_helmet;
  insert into public.inventory_items (tenant_id, donation_id, description, type, condition, face_value, status, intended_use, created_by)
  values (t, don_outfitters, 'Low-light goggles', 'goggles', 'new', 140.00, 'available', 'giveaway', actor)
  returning id into inv_goggles;
  insert into public.inventory_items (tenant_id, donation_id, description, type, condition, face_value, status, intended_use, notes, created_by)
  values (t, don_outfitters, 'Day lift ticket', 'lift_ticket', 'new', 129.00, 'available', 'giveaway', 'Donated by the resort for the midwinter social.', actor)
  returning id into inv_ticket;
  insert into public.inventory_items (tenant_id, donation_id, description, type, size, gender, condition, face_value, status, intended_use, created_by)
  values (t, don_priya, 'Snowboard boots', 'boots', '8', 'women', 'good', 160.00, 'reserved', 'gear_library', actor)
  returning id into inv_boots;
  insert into public.inventory_items (tenant_id, donation_id, description, type, size, gender, condition, face_value, status, intended_use, created_by)
  values (t, don_priya, 'Snow pants', 'pants', 'YL', 'kids', 'fair', 70.00, 'available', 'gear_library', actor)
  returning id into inv_pants;
  insert into public.inventory_items (tenant_id, donation_id, description, type, gender, condition, face_value, status, intended_use, created_by)
  values (t, don_priya, 'Waterproof mittens', 'gloves', 'kids', 'like_new', 45.00, 'available', 'gear_library', actor)
  returning id into inv_gloves;

  insert into public.inventory_movements (tenant_id, inventory_item_id, movement_type, occurred_at, reason, event_id, recipient_person_id, created_by)
  values
    (t, inv_board, 'received', now() - interval '75 days', 'Shop donation intake', null, null, actor),
    (t, inv_jacket, 'received', now() - interval '75 days', 'Shop donation intake', null, null, actor),
    (t, inv_helmet, 'received', now() - interval '75 days', 'Shop donation intake', null, null, actor),
    (t, inv_goggles, 'received', now() - interval '75 days', 'Shop donation intake', null, null, actor),
    (t, inv_ticket, 'received', now() - interval '70 days', 'Resort partnership', null, null, actor),
    (t, inv_boots, 'received', now() - interval '30 days', 'Individual donation intake', null, null, actor),
    (t, inv_pants, 'received', now() - interval '30 days', 'Individual donation intake', null, null, actor),
    (t, inv_gloves, 'received', now() - interval '30 days', 'Individual donation intake', null, null, actor),
    (t, inv_jacket, 'distributed', now() - interval '42 days', 'Season loan', ev_opener, p_marisol, actor),
    (t, inv_boots, 'reserved', now() - interval '5 days', 'Held for gear fitting night', ev_fitting, p_theo, actor);

  -- Money in ------------------------------------------------------------------
  insert into public.monetary_donations (tenant_id, donor_id, event_id, amount, method, received_date, notes, created_by)
  values
    (t, p_priya, null, 250.00, 'online', (now() - interval '60 days')::date, 'Recurring monthly gift.', actor),
    (t, p_fund, null, 5000.00, 'check', (now() - interval '90 days')::date, 'Operating grant, first of two payments.', actor),
    (t, p_priya, null, 250.00, 'online', (now() - interval '30 days')::date, 'Recurring monthly gift.', actor),
    (t, p_resort, ev_opener, 400.00, 'bank_transfer', (now() - interval '40 days')::date, 'Sponsorship of the opener.', actor);

  insert into public.event_revenue (tenant_id, event_id, source, amount, received_date, notes, created_by)
  values
    (t, ev_opener, 'registration_fees', 235.00, (now() - interval '42 days')::date, 'Sliding-scale contributions at the door.', actor),
    (t, ev_opener, 'onsite_donations', 118.00, (now() - interval '42 days')::date, null, actor),
    (t, ev_social, 'grants', 1000.00, (now() - interval '10 days')::date, 'Restricted to the social.', actor);

  -- Money out, one row at each approval state ---------------------------------
  insert into public.event_expenses (tenant_id, event_id, description, expense_date, amount, status, submitted_by, approved_by, approved_at, paid_by, paid_at, paid_by_person_id, notes, created_by)
  values (t, ev_opener, 'Group lift tickets (12)', (now() - interval '43 days')::date, 720.00, 'paid', actor, actor, now() - interval '41 days', actor, now() - interval '38 days', p_sasha, 'Discounted group rate.', actor);
  insert into public.event_expenses (tenant_id, event_id, description, expense_date, amount, status, submitted_by, approved_by, approved_at, created_by)
  values (t, ev_opener, 'Lunch for volunteers', (now() - interval '42 days')::date, 145.50, 'approved', actor, actor, now() - interval '40 days', actor);
  insert into public.event_expenses (tenant_id, event_id, description, expense_date, amount, status, submitted_by, notes, created_by)
  values (t, ev_fitting, 'Boot-fitting supplies', (now() - interval '3 days')::date, 89.20, 'submitted', actor, 'Waiting on the treasurer.', actor);
  insert into public.event_expenses (tenant_id, event_id, description, expense_date, amount, status, submitted_by, rejected_by, rejected_at, rejection_reason, created_by)
  values (t, ev_social, 'Photo booth rental', (now() - interval '8 days')::date, 450.00, 'rejected', actor, actor, now() - interval '6 days', 'Over the social''s budget; revisit next season.', actor);

  insert into public.event_sponsors (tenant_id, event_id, person_id, support_type, in_kind_description, contribution_value, is_public, follow_up_status, created_by)
  values
    (t, ev_opener, p_resort, 'in_kind', 'Base-area meeting space and discounted group tickets.', 900.00, true, 'done', actor),
    (t, ev_social, p_outfitters, 'in_kind', 'Giveaway prizes.', 650.00, true, 'in_progress', actor);

  -- The giveaway at the social ------------------------------------------------
  insert into public.giveaways (tenant_id, event_id, name, tickets_sold, ticket_price, revenue_amount, drawing_date, notes, created_by)
  values (t, ev_social, 'Midwinter gear giveaway', 0, 5.00, 0, now() + interval '48 days' + interval '3 hours', 'Tickets at the door; the premium tier is for anyone who brings a gear donation.', actor)
  returning id into gv;

  insert into public.giveaway_tiers (tenant_id, giveaway_id, key, label, rank, created_by)
  values (t, gv, 'general', 'General', 1, actor)
  returning id into tier_general;
  insert into public.giveaway_tiers (tenant_id, giveaway_id, key, label, rank, created_by)
  values (t, gv, 'premium', 'Premium', 2, actor)
  returning id into tier_premium;

  insert into public.giveaway_tier_rules (tenant_id, giveaway_id, tier_id, match_text, created_by)
  values
    (t, gv, tier_general, 'door', actor),
    (t, gv, tier_premium, 'donation', actor);

  insert into public.giveaway_buckets (tenant_id, giveaway_id, tier_id, name, rank, created_by)
  values (t, gv, tier_general, 'Everyday gear', 1, actor)
  returning id into bucket_general;

  insert into public.giveaway_prizes (tenant_id, giveaway_id, prize_name, estimated_value, donor_person_id, source_inventory_item_id, bucket_id, created_by)
  values
    (t, gv, 'Low-light goggles', 140.00, p_outfitters, inv_goggles, bucket_general, actor),
    (t, gv, 'Day lift ticket', 129.00, p_resort, inv_ticket, bucket_general, actor);

  -- Community calendar --------------------------------------------------------
  insert into public.calendar_items (tenant_id, title, item_type, starts_at, ends_at, time_zone, summary, priority_tier, calendar_status, visibility, owner_id, created_by)
  values
    (t, 'Midwinter Social and Giveaway', 'own_event', now() + interval '48 days', now() + interval '48 days' + interval '4 hours', tz, 'The fundraiser. Content push starts three weeks out.', 1, 'active', 'public', p_rowan, actor),
    (t, 'Gear drive with Northfork Outfitters', 'partner_event', now() + interval '26 days', now() + interval '26 days' + interval '6 hours', tz, 'Drop-off bins in the shop for a week; we collect on the Saturday.', 2, 'active', 'public', p_ines, actor),
    (t, 'Beginner-season content push', 'content_campaign', now() + interval '12 days', now() + interval '33 days', tz, 'Three posts: what to wear, what the gear library lends, how First Turns works.', 2, 'idea', 'internal', p_ines, actor),
    (t, 'End-of-season thank-yous', 'content_campaign', now() + interval '110 days', null, tz, 'Donor and volunteer thank-yous once the season closes.', 3, 'idea', 'internal', null, actor);

  -- Governance ----------------------------------------------------------------
  insert into public.governance_meetings (tenant_id, meeting_date, meeting_type, status, location, notes, facilitator_person_id, notetaker_person_id, minutes_approved_at, minutes_approved_by, created_by)
  values (t, now() - interval '21 days', 'board', 'completed', 'Community room', 'Quorum met. Minutes approved at the following meeting.', p_rowan, p_ines, now() - interval '2 days', actor, actor)
  returning id into mtg_past;

  insert into public.governance_meetings (tenant_id, meeting_date, meeting_type, status, location, facilitator_person_id, created_by)
  values (t, now() + interval '9 days', 'board', 'scheduled', 'Community room', p_rowan, actor)
  returning id into mtg_next;

  insert into public.governance_meeting_attendees (tenant_id, meeting_id, person_id, attended, created_by)
  values
    (t, mtg_past, p_rowan, true, actor),
    (t, mtg_past, p_sasha, true, actor),
    (t, mtg_past, p_ines, true, actor);

  insert into public.agendas (tenant_id, meeting_id, body_text, new_business, parking_lot, next_meeting_date, next_meeting_topics, created_by)
  values (
    t, mtg_past,
    'Standing items: finance report, gear library numbers, upcoming events.',
    '[{"title": "Midwinter social budget", "notes": "Approved at 1,800."}, {"title": "Season pass pilot", "notes": "Three passes this season; review in spring."}]'::jsonb,
    '[{"title": "Insurance renewal"}, {"title": "Storage unit lease"}]'::jsonb,
    (now() + interval '9 days')::date,
    'Gear drive logistics, spring tour go/no-go.',
    actor
  );

  insert into public.governance_meeting_action_items (tenant_id, meeting_id, description, owner_person_id, due_date, status, created_by)
  values
    (t, mtg_past, 'Confirm the resort''s donation of lift tickets for the giveaway.', p_rowan, (now() + interval '5 days')::date, 'open', actor),
    (t, mtg_past, 'Circulate the draft budget before the next meeting.', p_sasha, (now() + interval '7 days')::date, 'open', actor),
    (t, mtg_past, 'Post the approved minutes to the shared drive.', p_ines, (now() - interval '10 days')::date, 'done', actor);

  -- Volunteers ----------------------------------------------------------------
  insert into public.volunteer_applications (tenant_id, person_id, name, email, phone, role_interest, availability, status, pronouns, reference_code, created_at)
  values
    (t, p_dee, 'Dee Halvorsen', 'dee@demo.invalid', '555-0100', 'Ride lead', 'Most weekends through March.', 'placed', 'she/her', public.generate_volunteer_reference_code(t), now() - interval '120 days'),
    (t, p_kai, 'Kai Otsuka', 'kai@demo.invalid', null, 'Gear fitter', 'Weekday evenings.', 'contacted', 'he/him', public.generate_volunteer_reference_code(t), now() - interval '25 days'),
    (t, p_quinn, 'Quinn Sorensen', 'quinn@demo.invalid', null, 'Event greeter', 'Whenever there is an event.', 'new', 'they/them', public.generate_volunteer_reference_code(t), now() - interval '3 days');

  insert into public.volunteer_hours (tenant_id, person_id, event_id, volunteer_role_type_id, hours, logged_date, notes, logged_by)
  values
    (t, p_dee, ev_opener, vrt_lead, 8.00, (now() - interval '42 days')::date, 'Led the intermediate group.', actor),
    (t, p_kai, ev_opener, vrt_greeter, 4.50, (now() - interval '42 days')::date, null, actor),
    (t, p_dee, null, vrt_fitter, 3.00, (now() - interval '20 days')::date, 'Sorting the gear library.', actor),
    (t, p_quinn, null, vrt_greeter, 2.00, (now() - interval '9 days')::date, 'Helped with the mailing.', actor);

  -- Inbox ---------------------------------------------------------------------
  insert into public.contact_messages (tenant_id, name, email, topic, message, status, created_at)
  values
    (t, 'Alex Moreno', 'alex@demo.invalid', 'Gear', 'Do you have kids'' outerwear? My nephew is starting this winter and has outgrown everything.', 'new', now() - interval '2 days'),
    (t, 'Sam Whitfield', 'sam@demo.invalid', 'Volunteering', 'I ski most weekends and would like to help out. What do you need?', 'read', now() - interval '11 days'),
    (t, 'Jordan Pike', 'jordan@demo.invalid', 'Partnership', 'We run a shop on the north side and would like to talk about a gear drive.', 'resolved', now() - interval '40 days');

  -- Settings, branding and the public site ------------------------------------
  insert into public.app_settings (tenant_id, key, value, updated_by)
  values
    (t, 'page_visibility.programs', 'true'::jsonb, actor),
    (t, 'page_visibility.learn', 'true'::jsonb, actor),
    (t, 'page_visibility.support', 'true'::jsonb, actor),
    (t, 'brand.primary', '"#1f6f8b"'::jsonb, actor),
    (t, 'brand.primary_deep', '"#10333f"'::jsonb, actor),
    (t, 'brand.primary_soft', '"#dceef4"'::jsonb, actor),
    (t, 'brand.background', '"#f2f9fb"'::jsonb, actor)
  on conflict (tenant_id, key) do update
    set value = excluded.value, updated_by = excluded.updated_by;

  insert into public.site_content (tenant_id, key, value, updated_by)
  values
    (t, 'org.short_name', '"the demo org"'::jsonb, actor),
    (t, 'org.tagline', '"A demonstration organization. Every name, number and record here is invented."'::jsonb, actor),
    (t, 'org.email_general', '"hello@demo.invalid"'::jsonb, actor),
    (t, 'home.heading', '"A demo of the operations portal"'::jsonb, actor),
    (t, 'home.intro', '"This is a sample organization used to show the portal. Nothing here is real: no person, donation or record on this site describes anybody."'::jsonb, actor)
  on conflict (tenant_id, key) do update
    set value = excluded.value, updated_by = excluded.updated_by;

  return jsonb_build_object(
    'tenant_id', t,
    'people', (select count(*) from public.people where tenant_id = t),
    'events', (select count(*) from public.events where tenant_id = t),
    'inventory_items', (select count(*) from public.inventory_items where tenant_id = t),
    'registrations', (select count(*) from public.event_registrations where tenant_id = t)
  );
end;
$$;
