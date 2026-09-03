-- people.is_donor/is_sponsor/is_volunteer are written by every caller that
-- happens to remember to: inline inserts in the intake RPCs plus the
-- p_role_flag argument on resolve_or_create_person_by_email (20260824150000).
-- Two defects follow.
--
-- 1. Linking an *existing* person sets nothing. PersonPicker's newPersonRole
--    only seeds the create-new branch, and the server paths don't compensate
--    -- add_event_sponsor writes event_sponsors and stops -- so /portal/
--    sponsors is missing sponsors. This contradicts spec 5.8 item 3.
--    is_attendee is the only safe flag because it is the only one driven by a
--    trigger (set_person_is_attendee, 20260901000000).
-- 2. No flag is ever cleared. There is not one `is_<role> = false` in this
--    directory. Delete a person's only donation and they stay a Donor.
--
-- This replaces every scattered writer with one recompute driven by triggers
-- on the tables that actually create each role.
--
-- Manual assertions get their own table rather than being expressed as a bare
-- column write. Without it, "recompute and clear" would be actively worse
-- than today: a sponsor added from the directory before any event link exists
-- (the New Sponsor button) has no derived backing, so the first unrelated
-- sync -- say they later register for an event -- would silently drop the
-- sponsor flag. #624 replaces the columns with a view over these same two
-- sources; this table is that view's manual half, brought forward because
-- clearing is unsafe without it.

create table public.person_role_tags (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null check (role in ('donor', 'sponsor', 'volunteer', 'attendee')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) default auth.uid(),
  notes text,
  unique (person_id, role)
);

create index person_role_tags_person_id_idx on public.person_role_tags (person_id);

alter table public.person_role_tags enable row level security;

-- Same gate as the people row the tag hangs off, plus people_intake for the
-- inline-create paths that may assert a role while creating a contact.
create policy "person_role_tags select" on public.person_role_tags for select to authenticated
  using (public.has_permission('people', 'view'));
create policy "person_role_tags insert" on public.person_role_tags for insert to authenticated
  with check (public.has_permission('people', 'manage') or public.has_permission('people_intake', 'manage'));
create policy "person_role_tags update" on public.person_role_tags for update to authenticated
  using (public.has_permission('people', 'manage')) with check (public.has_permission('people', 'manage'));
create policy "person_role_tags delete" on public.person_role_tags for delete to authenticated
  using (public.has_permission('people', 'manage'));

grant select, insert, update, delete on public.person_role_tags to authenticated;

-- Recompute every role flag for one person from the records that create the
-- role, unioned with any manual tag. security definer because the triggers
-- below fire from anon-callable RPCs (register_for_event, submit_volunteer_
-- application), whose caller holds no update grant on people -- the same
-- reasoning set_person_is_attendee and audit_log_row already document.
create function public.sync_person_role_flags(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donor boolean;
  v_sponsor boolean;
  v_volunteer boolean;
  v_attendee boolean;
begin
  if p_person_id is null then
    return;
  end if;

  v_donor :=
    exists (select 1 from public.donations where donor_id = p_person_id)
    or exists (select 1 from public.monetary_donations where donor_id = p_person_id)
    or exists (select 1 from public.giveaway_prizes where donor_person_id = p_person_id)
    or exists (select 1 from public.person_role_tags where person_id = p_person_id and role = 'donor');

  v_sponsor :=
    exists (select 1 from public.event_sponsors where person_id = p_person_id)
    or exists (select 1 from public.person_role_tags where person_id = p_person_id and role = 'sponsor');

  -- An application counts, matching today's behavior: submit_volunteer_
  -- application has always flagged the applicant at submission time, before
  -- any signup or logged hour exists.
  v_volunteer :=
    exists (select 1 from public.event_volunteers where person_id = p_person_id)
    or exists (select 1 from public.volunteer_hours where person_id = p_person_id)
    or exists (select 1 from public.volunteer_applications where person_id = p_person_id)
    or exists (select 1 from public.person_role_tags where person_id = p_person_id and role = 'volunteer');

  v_attendee :=
    exists (select 1 from public.event_registrations where person_id = p_person_id)
    or exists (select 1 from public.person_role_tags where person_id = p_person_id and role = 'attendee');

  -- Guarded so an unchanged person is not rewritten on every source-row
  -- touch; updated_at triggers and future auditing stay quiet.
  update public.people
     set is_donor = v_donor,
         is_sponsor = v_sponsor,
         is_volunteer = v_volunteer,
         is_attendee = v_attendee
   where id = p_person_id
     and (is_donor, is_sponsor, is_volunteer, is_attendee)
         is distinct from (v_donor, v_sponsor, v_volunteer, v_attendee);
end;
$$;

grant execute on function public.sync_person_role_flags(uuid) to authenticated;

-- One trigger function for every source table: TG_ARGV[0] names that table's
-- person column, read out of the row as jsonb so the same body serves
-- donor_id, donor_person_id, and person_id. Syncs both sides of an update so
-- re-pointing a donation at a different donor clears the old one.
create function public.sync_person_role_flags_from_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_column text := TG_ARGV[0];
  v_old uuid;
  v_new uuid;
begin
  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := (to_jsonb(OLD) ->> v_column)::uuid;
  end if;
  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := (to_jsonb(NEW) ->> v_column)::uuid;
  end if;

  if v_old is not null and v_old is distinct from v_new then
    perform public.sync_person_role_flags(v_old);
  end if;
  if v_new is not null then
    perform public.sync_person_role_flags(v_new);
  end if;

  return null;
end;
$$;

create trigger sync_role_flags after insert or update or delete on public.donations
  for each row execute function public.sync_person_role_flags_from_row('donor_id');
create trigger sync_role_flags after insert or update or delete on public.monetary_donations
  for each row execute function public.sync_person_role_flags_from_row('donor_id');
create trigger sync_role_flags after insert or update or delete on public.giveaway_prizes
  for each row execute function public.sync_person_role_flags_from_row('donor_person_id');
create trigger sync_role_flags after insert or update or delete on public.event_sponsors
  for each row execute function public.sync_person_role_flags_from_row('person_id');
create trigger sync_role_flags after insert or update or delete on public.event_registrations
  for each row execute function public.sync_person_role_flags_from_row('person_id');
create trigger sync_role_flags after insert or update or delete on public.event_volunteers
  for each row execute function public.sync_person_role_flags_from_row('person_id');
create trigger sync_role_flags after insert or update or delete on public.volunteer_hours
  for each row execute function public.sync_person_role_flags_from_row('person_id');
create trigger sync_role_flags after insert or update or delete on public.volunteer_applications
  for each row execute function public.sync_person_role_flags_from_row('person_id');

create trigger sync_role_flags after insert or update or delete on public.person_role_tags
  for each row execute function public.sync_person_role_flags_from_row('person_id');

-- set_person_is_attendee (20260901000000) is now one of nine writers doing
-- the same job, and the only one that cannot clear. Drop it.
drop trigger if exists set_person_is_attendee on public.event_registrations;
drop function if exists public.set_person_is_attendee();

-- Preserve today's data before the first recompute: any flag that is true
-- with no derived record behind it was a deliberate human assertion (the New
-- Sponsor button, a checkbox on the person form), so record it as one rather
-- than letting the recompute erase it, then correct every row.
--
-- Kept as a function rather than inlined because supabase/seed.sql also
-- writes role flags straight onto its people inserts and runs *after* this
-- migration, so the local dev database needs the same pass; it doubles as a
-- repair tool if flags are ever edited out of band.
create function public.reconcile_person_role_flags()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  insert into public.person_role_tags (person_id, role, notes)
  select p.id, 'donor', 'Backfilled from people.is_donor'
    from public.people p
   where p.is_donor
     and not exists (select 1 from public.donations d where d.donor_id = p.id)
     and not exists (select 1 from public.monetary_donations m where m.donor_id = p.id)
     and not exists (select 1 from public.giveaway_prizes g where g.donor_person_id = p.id)
  on conflict (person_id, role) do nothing;

  insert into public.person_role_tags (person_id, role, notes)
  select p.id, 'sponsor', 'Backfilled from people.is_sponsor'
    from public.people p
   where p.is_sponsor
     and not exists (select 1 from public.event_sponsors s where s.person_id = p.id)
  on conflict (person_id, role) do nothing;

  insert into public.person_role_tags (person_id, role, notes)
  select p.id, 'volunteer', 'Backfilled from people.is_volunteer'
    from public.people p
   where p.is_volunteer
     and not exists (select 1 from public.event_volunteers v where v.person_id = p.id)
     and not exists (select 1 from public.volunteer_hours h where h.person_id = p.id)
     and not exists (select 1 from public.volunteer_applications a where a.person_id = p.id)
  on conflict (person_id, role) do nothing;

  insert into public.person_role_tags (person_id, role, notes)
  select p.id, 'attendee', 'Backfilled from people.is_attendee'
    from public.people p
   where p.is_attendee
     and not exists (select 1 from public.event_registrations er where er.person_id = p.id)
  on conflict (person_id, role) do nothing;

  -- This pass is what fixes the sponsors/donors/volunteers that were linked
  -- to a record but never flagged.
  for r in select id from public.people loop
    perform public.sync_person_role_flags(r.id);
  end loop;
end;
$$;

-- Deliberately not granted to authenticated: a full-table pass is a
-- maintenance operation, not something the portal should be able to trigger.

select public.reconcile_person_role_flags();
