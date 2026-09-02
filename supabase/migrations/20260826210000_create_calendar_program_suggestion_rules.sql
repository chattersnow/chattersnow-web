-- Content & Community Calendar: admin-configurable program-suggestion rules
-- (spec §5.20, issue #110). A rule maps a calendar-item attribute (item_type
-- and/or category) to a suggested program. Suggestions are informational
-- only -- nothing here writes to calendar_item_programs directly; accepting
-- a suggestion in the item editor is a manual click that inserts a row
-- there exactly like checking any other program checkbox.
create table public.calendar_program_suggestion_rules (
  id uuid primary key default gen_random_uuid(),
  item_type text check (item_type in (
    'chatter_event', 'partner_event', 'community_observance',
    'heritage_social_justice_moment', 'winter_outdoor_sports_moment',
    'content_campaign', 'fundraiser', 'partner_opportunity', 'content_opportunity'
  )),
  category text check (category in (
    'lgbtq_community', 'winter_outdoor_sports', 'community_social_justice',
    'chatter_events', 'campaigns_fundraising', 'partner_opportunities'
  )),
  program_id uuid not null references public.programs(id) on delete cascade,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  -- A rule with both null would match every item, which is never useful and
  -- is almost certainly a data-entry mistake.
  check (item_type is not null or category is not null)
);

create trigger set_updated_at before update on public.calendar_program_suggestion_rules
  for each row execute function public.set_updated_at();

-- NULL means "any" for that dimension, and Postgres treats each NULL as
-- distinct for uniqueness, so a plain table constraint wouldn't catch two
-- identical (category=lgbtq_community, item_type=NULL, program=X) rows.
-- Coalesce both nullable columns in an expression index instead.
create unique index calendar_program_suggestion_rules_unique_rule
  on public.calendar_program_suggestion_rules (
    coalesce(item_type, ''), coalesce(category, ''), program_id
  );

alter table public.calendar_program_suggestion_rules enable row level security;

-- Same content_calendar resource as calendar_items and content_brief_templates
-- -- a suggestion rule is just another kind of calendar-configuration record.
create policy "calendar_program_suggestion_rules select" on public.calendar_program_suggestion_rules for select to authenticated
  using (public.has_permission('content_calendar', 'view'));
create policy "calendar_program_suggestion_rules insert" on public.calendar_program_suggestion_rules for insert to authenticated
  with check (public.has_permission('content_calendar', 'manage'));
create policy "calendar_program_suggestion_rules update" on public.calendar_program_suggestion_rules for update to authenticated
  using (public.has_permission('content_calendar', 'manage')) with check (public.has_permission('content_calendar', 'manage'));
create policy "calendar_program_suggestion_rules delete" on public.calendar_program_suggestion_rules for delete to authenticated
  using (public.has_permission('content_calendar', 'manage'));
grant select, insert, update, delete on public.calendar_program_suggestion_rules to authenticated;
