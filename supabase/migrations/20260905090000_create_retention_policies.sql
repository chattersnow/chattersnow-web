-- Issue #602: the published privacy policy (/privacy) states a retention period
-- for every category of personal data the site collects, and nothing enforces
-- any of them. No row is ever deleted or anonymized on a schedule, so the page
-- states a commitment the software does not keep. This is the first of six
-- migrations that close that gap; this one holds the rules, the next holds the
-- run log, and the purge itself comes after.
--
-- Why a table and not app_settings (20260823040000): eight policies there would
-- be eight opaque jsonb keys with no label, no clock description, and no
-- per-rule kill switch, and app_settings' select policy admits
-- system_settings/event_expenses/content_calendar managers -- the wrong
-- audience for a data-destruction control. A typed table also gives
-- run_retention_purge() a list to drive from and the portal page something to
-- render directly.
--
-- Why not constants in the purge function: the board sets these periods and
-- will amend them (the record at planning/decisions/2026-09-02-personal-data-
-- retention-and-privacy-policy.md is still marked Draft, pending approval).
-- Amending a constant means a migration *and* a deploy, and leaves no way to
-- stop a misbehaving rule without one. `mode` is the single most important
-- safety property in this feature -- see the seed below.
--
-- `interval` rather than a month count: rate_limit_hits is days and
-- portal_accounts is a short grace, so months would force fractions.

create table public.retention_policies (
  policy_key text primary key,
  label text not null,
  period interval not null,
  -- Only volunteer_applications has two clocks (a shorter one for applications
  -- we declined or closed). Null everywhere else.
  secondary_period interval,
  mode text not null default 'dry_run'
    check (mode in ('off', 'dry_run', 'enforce')),
  description text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.retention_policies
  for each row execute function public.set_updated_at();

-- Every policy ships in dry_run. `development` and `main` deploy from the same
-- Supabase project (.github/workflows/db-migrate.yml), so a migration reaches
-- real donor and participant data on merge. In dry_run the nightly job still
-- runs and still writes a full run log with real per-table counts -- it just
-- changes nothing. An admin reviews a few nights of counts on
-- Administration > Data Retention and flips policies to 'enforce' one at a
-- time. Turning this feature on is deliberately a human decision, not a merge.
--
-- The periods below are transcribed from the RETENTION list on /privacy, which
-- is itself transcribed from the board decision record. src/lib/retention.ts
-- carries the same numbers for the page to render, and an integration test
-- asserts the two cannot drift.
insert into public.retention_policies (policy_key, label, period, secondary_period, description) values
  ('contact_messages', 'Contact form messages', interval '2 years', null,
   'Measured from the date the message was submitted.'),
  ('volunteer_applications', 'Volunteer applications', interval '2 years', interval '1 year',
   'Measured from the applicant''s last activity, or from the last update to the application when it was declined or closed (the secondary period).'),
  ('event_registrations', 'Event registrations', interval '3 years', null,
   'Measured from the end of the event. The registration row survives with its personal fields stripped, so attendance and impact counts stay intact.'),
  ('rider_profiles', 'Rider profiles', interval '2 years', null,
   'Measured from the person''s last activity. Clears the riding discipline, experience levels and preferred mountain, and anonymizes the person record when nothing else needs it.'),
  ('gear_requests', 'Gear requests', interval '3 years', null,
   'Measured from the most recent handover. The inventory movement survives as inventory history; only the link to the requester is removed.'),
  ('portal_accounts', 'Portal accounts', interval '3 months', null,
   'Measured from the date access was deactivated. PROPOSED, not board-approved: the published policy says access ends when the role ends but names no period for clearing the portal record.'),
  ('pending_role_grants', 'Unclaimed portal invitations', interval '1 year', null,
   'Measured from the invitation being claimed, revoked or expiring. PROPOSED, not board-approved: the published policy does not cover invitation emails.'),
  ('rate_limit_hits', 'Form abuse-protection records', interval '7 days', null,
   'Measured from the request. Holds the submitter''s IP address; the widest rate-limit window in use is 15 minutes.');

alter table public.retention_policies enable row level security;

-- Same posture as audit_log (20260822120000): readable by administration
-- managers, written by nobody through the API. mode changes go through
-- set_retention_policy_mode() below so they are authorized in one place and
-- can't be made by a stray .from().update().
create policy "retention_policies select" on public.retention_policies
  for select to authenticated
  using (public.has_permission('administration', 'manage'));

grant select on public.retention_policies to authenticated;

-- Which foreign keys pointing at people are allowed to be dropped by the purge.
--
-- run_retention_purge() decides whether a person can be anonymized by walking
-- every FK that references public.people -- the same pg_constraint discovery
-- merge_people() uses (20260904180000), which exists because there are 40+ such
-- columns across 30+ tables "and the schema gains more most weeks". A person
-- referenced by anything NOT listed here is retained.
--
-- The direction is the whole point, and inverting it would be a bug rather
-- than a preference. An *exempt* list means a table added next week is treated
-- as purgeable by default, and the first time that happens the job anonymizes a
-- donor. A *purgeable* list means a new table defaults to retain: the job keeps
-- something it could have removed, which shows up as a stubborn count on the
-- retention page and gets fixed in review. One failure mode is recoverable and
-- the other is not.
create table public.retention_purgeable_person_refs (
  table_name text not null,
  column_name text not null,
  primary key (table_name, column_name)
);

insert into public.retention_purgeable_person_refs (table_name, column_name) values
  ('event_registrations', 'person_id'),
  ('volunteer_applications', 'person_id'),
  ('inventory_movements', 'recipient_person_id'),
  ('event_volunteers', 'person_id'),
  ('person_role_tags', 'person_id');

-- Not part of the client-facing API surface: read only by the purge (security
-- definer, bypasses RLS) and by migrations. Same treatment as audited_tables
-- (20260828060000) -- no policies, no grants.
alter table public.retention_purgeable_person_refs enable row level security;

-- The one write path for a policy. Authorization is re-checked here rather than
-- trusted from the server action, matching merge_people() and
-- set_person_role_tags().
create function public.set_retention_policy_mode(
  p_policy_key text,
  p_mode text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('administration', 'manage') then
    raise exception 'Not authorized';
  end if;

  if p_mode not in ('off', 'dry_run', 'enforce') then
    raise exception 'Unknown retention mode: %', p_mode;
  end if;

  update public.retention_policies
     set mode = p_mode,
         updated_by = auth.uid()
   where policy_key = p_policy_key;

  if not found then
    raise exception 'No such retention policy: %', p_policy_key;
  end if;
end;
$$;

grant execute on function public.set_retention_policy_mode to authenticated;
