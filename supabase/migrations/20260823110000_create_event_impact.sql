-- Per-event impact capture (spec §5.15/§6, issue #47): participation counts,
-- financial assistance, the one volunteer-support figure not derivable from
-- event_volunteer_hours (beginner pairings), and the 5-question post-event
-- outcomes survey from planning/ideas/RUNNING_PROGRAMS.md, stored as
-- aggregate yes-counts. Equipment-loaned-by-type and volunteer hours/headcount
-- are deliberately NOT captured here — spec §5.15 sources those from
-- inventory_movements (via the existing Distributions tab) and
-- event_volunteer_hours, so duplicating them here would create two
-- disagreeing sources of truth. One row per event.

create table public.event_impact_notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,

  -- Participation
  total_participants integer check (total_participants is null or total_participants >= 0),
  first_time_participants integer check (first_time_participants is null or first_time_participants >= 0),
  first_time_riders integer check (first_time_riders is null or first_time_riders >= 0),
  beginner_participants integer check (beginner_participants is null or beginner_participants >= 0),
  volunteer_participants integer check (volunteer_participants is null or volunteer_participants >= 0),

  -- Financial assistance
  subsidized_tickets_count integer check (subsidized_tickets_count is null or subsidized_tickets_count >= 0),
  rental_subsidies_count integer check (rental_subsidies_count is null or rental_subsidies_count >= 0),
  equipment_loans_count integer check (equipment_loans_count is null or equipment_loans_count >= 0),
  assistance_total numeric(10, 2) check (assistance_total is null or assistance_total >= 0),

  -- Volunteer support (not tracked elsewhere)
  beginner_pairings_count integer check (beginner_pairings_count is null or beginner_pairings_count >= 0),

  -- Post-event outcomes survey, aggregate yes-counts
  survey_respondents_count integer check (survey_respondents_count is null or survey_respondents_count >= 0),
  survey_easier_to_participate_yes_count integer
    check (survey_easier_to_participate_yes_count is null or survey_easier_to_participate_yes_count >= 0),
  survey_would_not_have_participated_without_assistance_yes_count integer
    check (survey_would_not_have_participated_without_assistance_yes_count is null or survey_would_not_have_participated_without_assistance_yes_count >= 0),
  survey_first_time_skiing_yes_count integer
    check (survey_first_time_skiing_yes_count is null or survey_first_time_skiing_yes_count >= 0),
  survey_felt_welcomed_yes_count integer
    check (survey_felt_welcomed_yes_count is null or survey_felt_welcomed_yes_count >= 0),
  survey_would_attend_again_yes_count integer
    check (survey_would_attend_again_yes_count is null or survey_would_attend_again_yes_count >= 0),

  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.event_impact_notes
  for each row execute function public.set_updated_at();

alter table public.event_impact_notes enable row level security;

create policy "event_impact_notes select" on public.event_impact_notes for select to authenticated
  using (public.has_permission('event_impact', 'view'));
create policy "event_impact_notes insert" on public.event_impact_notes for insert to authenticated
  with check (public.has_permission('event_impact', 'manage'));
create policy "event_impact_notes update" on public.event_impact_notes for update to authenticated
  using (public.has_permission('event_impact', 'manage')) with check (public.has_permission('event_impact', 'manage'));
create policy "event_impact_notes delete" on public.event_impact_notes for delete to authenticated
  using (public.has_permission('event_impact', 'manage'));

grant select, insert, update, delete on public.event_impact_notes to authenticated;

-- Add the resource to the permissions catalog (left out of 20260822090000
-- pending this table being built) and grant access matching
-- event_volunteer_hours: coordinator authors it, finance/board can view it
-- for reporting, volunteers can't see it.
insert into public.resources (key, section, label, description, sort_order) values
  ('event_impact', 'Events', 'Impact tracking', 'Per-event participation, financial assistance, and outcomes survey capture', 45);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'manage'),
  ('event_coordinator', 'manage'),
  ('finance', 'view'),
  ('board', 'view'),
  ('volunteer', 'none')
) as v(role_name, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = 'event_impact';
