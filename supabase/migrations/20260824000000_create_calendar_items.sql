-- Content & Community Calendar: generic item model (spec §5.20/§6, issue #103).
-- A calendar item is reusable across future programs, not calendar-app-specific:
-- Chatter events, partner events, community observances, heritage/social-justice
-- moments, sports moments, campaigns, fundraisers, and partner/content
-- opportunities are all rows here. Content-opportunity/brief fields are scoped
-- to a separate linked table in issue #106, not added here.

create table public.calendar_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  item_type text not null check (item_type in (
    'chatter_event', 'partner_event', 'community_observance',
    'heritage_social_justice_moment', 'winter_outdoor_sports_moment',
    'content_campaign', 'fundraiser', 'partner_opportunity', 'content_opportunity'
  )),
  starts_at timestamptz not null,
  ends_at timestamptz,
  time_zone text not null,
  recurrence_rule text,
  summary text,
  priority_tier smallint not null default 3 check (priority_tier in (1, 2, 3)),
  priority_rationale text,
  calendar_status text not null default 'idea'
    check (calendar_status in ('idea', 'active', 'complete', 'archived')),
  visibility text not null default 'internal'
    check (visibility in ('public', 'internal', 'unlisted_draft')),
  owner_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  check (ends_at is null or ends_at >= starts_at)
);

create trigger set_updated_at before update on public.calendar_items
  for each row execute function public.set_updated_at();

-- Category taxonomy: labels layered on top of item_type/priority_tier, not a
-- substitute for either. An item can carry more than one category.
create table public.calendar_item_categories (
  item_id uuid not null references public.calendar_items(id) on delete cascade,
  category text not null check (category in (
    'lgbtq_community', 'winter_outdoor_sports', 'community_social_justice',
    'chatter_events', 'campaigns_fundraising', 'partner_opportunities'
  )),
  primary key (item_id, category)
);

-- Links a calendar item to one or more existing programs.
create table public.calendar_item_programs (
  item_id uuid not null references public.calendar_items(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  primary key (item_id, program_id)
);

-- Self-referencing "related items" links.
create table public.calendar_item_links (
  item_id uuid not null references public.calendar_items(id) on delete cascade,
  related_item_id uuid not null references public.calendar_items(id) on delete cascade,
  primary key (item_id, related_item_id),
  check (item_id <> related_item_id)
);

alter table public.calendar_items enable row level security;
alter table public.calendar_item_categories enable row level security;
alter table public.calendar_item_programs enable row level security;
alter table public.calendar_item_links enable row level security;

create policy "calendar_items select" on public.calendar_items for select to authenticated
  using (public.has_permission('content_calendar', 'view'));
create policy "calendar_items insert" on public.calendar_items for insert to authenticated
  with check (public.has_permission('content_calendar', 'manage'));
create policy "calendar_items update" on public.calendar_items for update to authenticated
  using (public.has_permission('content_calendar', 'manage')) with check (public.has_permission('content_calendar', 'manage'));
create policy "calendar_items delete" on public.calendar_items for delete to authenticated
  using (public.has_permission('content_calendar', 'manage'));
grant select, insert, update, delete on public.calendar_items to authenticated;

create policy "calendar_item_categories select" on public.calendar_item_categories for select to authenticated
  using (public.has_permission('content_calendar', 'view'));
create policy "calendar_item_categories insert" on public.calendar_item_categories for insert to authenticated
  with check (public.has_permission('content_calendar', 'manage'));
create policy "calendar_item_categories update" on public.calendar_item_categories for update to authenticated
  using (public.has_permission('content_calendar', 'manage')) with check (public.has_permission('content_calendar', 'manage'));
create policy "calendar_item_categories delete" on public.calendar_item_categories for delete to authenticated
  using (public.has_permission('content_calendar', 'manage'));
grant select, insert, update, delete on public.calendar_item_categories to authenticated;

create policy "calendar_item_programs select" on public.calendar_item_programs for select to authenticated
  using (public.has_permission('content_calendar', 'view'));
create policy "calendar_item_programs insert" on public.calendar_item_programs for insert to authenticated
  with check (public.has_permission('content_calendar', 'manage'));
create policy "calendar_item_programs update" on public.calendar_item_programs for update to authenticated
  using (public.has_permission('content_calendar', 'manage')) with check (public.has_permission('content_calendar', 'manage'));
create policy "calendar_item_programs delete" on public.calendar_item_programs for delete to authenticated
  using (public.has_permission('content_calendar', 'manage'));
grant select, insert, update, delete on public.calendar_item_programs to authenticated;

create policy "calendar_item_links select" on public.calendar_item_links for select to authenticated
  using (public.has_permission('content_calendar', 'view'));
create policy "calendar_item_links insert" on public.calendar_item_links for insert to authenticated
  with check (public.has_permission('content_calendar', 'manage'));
create policy "calendar_item_links update" on public.calendar_item_links for update to authenticated
  using (public.has_permission('content_calendar', 'manage')) with check (public.has_permission('content_calendar', 'manage'));
create policy "calendar_item_links delete" on public.calendar_item_links for delete to authenticated
  using (public.has_permission('content_calendar', 'manage'));
grant select, insert, update, delete on public.calendar_item_links to authenticated;

-- Register the resource and grant per the §5.3 entitlement matrix pattern:
-- admin/event_coordinator manage, finance/board/volunteer view (same
-- distribution as the `programs` module).
insert into public.resources (key, section, label, description, sort_order) values
  ('content_calendar', 'Content Calendar', 'Content & Community Calendar', 'Calendar items spanning events, observances, campaigns, and content opportunities', 60);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'manage'),
  ('event_coordinator', 'manage'),
  ('finance', 'view'),
  ('board', 'view'),
  ('volunteer', 'view')
) as v(role_name, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = 'content_calendar';

-- Curated public read: only public + published (active/complete) items, and
-- only the columns needed for a listing -- owner, internal notes, and
-- junction-table detail never reach anon. Mirrors public_events.
-- auto_expose_new_tables is off in this project's config, so the grant below
-- is required alongside the view definition.
create view public.public_calendar_items as
select
  id,
  title,
  item_type,
  starts_at,
  ends_at,
  time_zone,
  summary,
  (
    select array_agg(c.category)
    from public.calendar_item_categories c
    where c.item_id = calendar_items.id
  ) as categories
from public.calendar_items
where visibility = 'public' and calendar_status in ('active', 'complete');

grant select on public.public_calendar_items to anon, authenticated;
