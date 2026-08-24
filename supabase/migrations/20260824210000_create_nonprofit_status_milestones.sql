-- Governance: nonprofit status milestones (issue #145; design recorded in
-- the local planning doc 2026-08-24-nonprofit-status-tracking-design.md).
-- Modeled on governance_meeting_action_items, with two deviations required
-- by that design: owner_person_id is optional (not required, as it is on
-- action items), and status is a three-value not_started/in_progress/done
-- lifecycle instead of action items' open/done. created_by is nullable
-- (see content_brief_templates for the same pattern/rationale) because this
-- migration seeds its own rows below, with no auth.uid() session.

create table public.nonprofit_status_milestones (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  phase text not null,
  owner_person_id uuid references public.people(id),
  due_date date,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.nonprofit_status_milestones
  for each row execute function public.set_updated_at();

alter table public.nonprofit_status_milestones enable row level security;

create policy "nonprofit_status_milestones select" on public.nonprofit_status_milestones for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "nonprofit_status_milestones insert" on public.nonprofit_status_milestones for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "nonprofit_status_milestones update" on public.nonprofit_status_milestones for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "nonprofit_status_milestones delete" on public.nonprofit_status_milestones for delete to authenticated
  using (public.has_permission('governance', 'manage'));

grant select, insert, update, delete on public.nonprofit_status_milestones to authenticated;

-- Seed: Phase 1-5 checklist from planning/governance/NONPROFIT_FORMATION.md
-- (spot-checked 2026-08-24). All not_started except the one Phase 1 item
-- the decision record calls already resolved.
insert into public.nonprofit_status_milestones (description, phase, status) values
  ('Decide NJ vs NY incorporation', 'Phase 1 — Now (founding/legal package)', 'done'),
  ('Confirm legal name availability', 'Phase 1 — Now (founding/legal package)', 'not_started'),
  ('Finalize mission', 'Phase 1 — Now (founding/legal package)', 'not_started'),
  ('Draft Certificate of Incorporation', 'Phase 1 — Now (founding/legal package)', 'not_started'),
  ('Draft bylaws', 'Phase 1 — Now (founding/legal package)', 'not_started'),
  ('Create conflict-of-interest policy', 'Phase 1 — Now (founding/legal package)', 'not_started'),
  ('Establish board/officer roles', 'Phase 1 — Now (founding/legal package)', 'not_started'),
  ('Define fiscal year', 'Phase 1 — Now (founding/legal package)', 'not_started'),
  ('Establish initial budget', 'Phase 1 — Now (founding/legal package)', 'not_started'),
  ('Document existing programs/events', 'Phase 1 — Now (founding/legal package)', 'not_started'),
  ('Evaluate the fiscal-sponsorship bridge strategy: decide whether to pursue a fiscal sponsor to fundraise during the gap before Chatter''s own 501(c)(3) determination, and set the decision point for dropping the sponsor once that determination arrives', 'Phase 1 — Now (founding/legal package)', 'not_started'),

  ('File NJ nonprofit', 'Phase 2 — Incorporation (NJ)', 'not_started'),
  ('Receive corporate formation documents', 'Phase 2 — Incorporation (NJ)', 'not_started'),
  ('Obtain EIN', 'Phase 2 — Incorporation (NJ)', 'not_started'),
  ('Hold organizational board meeting', 'Phase 2 — Incorporation (NJ)', 'not_started'),
  ('Adopt bylaws', 'Phase 2 — Incorporation (NJ)', 'not_started'),
  ('Approve bank account', 'Phase 2 — Incorporation (NJ)', 'not_started'),
  ('Approve IRS application', 'Phase 2 — Incorporation (NJ)', 'not_started'),
  ('Open nonprofit bank account', 'Phase 2 — Incorporation (NJ)', 'not_started'),

  ('Determine 1023 vs 1023-EZ', 'Phase 3 — Federal (501(c)(3))', 'not_started'),
  ('Prepare IRS application', 'Phase 3 — Federal (501(c)(3))', 'not_started'),
  ('Prepare program descriptions', 'Phase 3 — Federal (501(c)(3))', 'not_started'),
  ('Prepare financial projections', 'Phase 3 — Federal (501(c)(3))', 'not_started'),
  ('Submit application', 'Phase 3 — Federal (501(c)(3))', 'not_started'),
  ('Receive determination', 'Phase 3 — Federal (501(c)(3))', 'not_started'),

  ('Complete NJ charitable registration requirements', 'Phase 4 — State fundraising registration (NJ)', 'not_started'),
  ('Complete applicable NJ tax registrations', 'Phase 4 — State fundraising registration (NJ)', 'not_started'),
  ('Establish compliant donation processing', 'Phase 4 — State fundraising registration (NJ)', 'not_started'),
  ('Determine NY foreign-corporation registration requirements', 'Phase 4 — State fundraising registration (NY)', 'not_started'),
  ('Register with NY Charities Bureau', 'Phase 4 — State fundraising registration (NY)', 'not_started'),
  ('Establish NY annual reporting process', 'Phase 4 — State fundraising registration (NY)', 'not_started'),

  ('Website donations', 'Phase 5 — Fundraising infrastructure', 'not_started'),
  ('Donation receipts', 'Phase 5 — Fundraising infrastructure', 'not_started'),
  ('Donor database', 'Phase 5 — Fundraising infrastructure', 'not_started'),
  ('Sponsorships', 'Phase 5 — Fundraising infrastructure', 'not_started'),
  ('Grant applications', 'Phase 5 — Fundraising infrastructure', 'not_started'),
  ('Gear donations', 'Phase 5 — Fundraising infrastructure', 'not_started'),
  ('Event donations', 'Phase 5 — Fundraising infrastructure', 'not_started'),
  ('Financial reporting', 'Phase 5 — Fundraising infrastructure', 'not_started'),
  ('Annual reporting calendar', 'Phase 5 — Fundraising infrastructure', 'not_started');
