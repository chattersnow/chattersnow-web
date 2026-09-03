-- #624. The role flags stop being stored at all.
--
-- 20260903010000 fixed the correctness half of this: nine triggers and one
-- sync_person_role_flags() recompute replaced the many uncoordinated callers
-- that used to write people.is_donor/is_sponsor/is_volunteer/is_attendee, and
-- person_role_tags gave manual assertions a home so "recompute and clear"
-- could not erase them. That was deliberately a stepping stone -- "Donor" and
-- "Attendee" are facts about a person's history, not attributes of the person,
-- and the recompute body *is* the view body.
--
-- This migration moves that same SQL out of a trigger and into a view, drops
-- the four columns, and deletes the apparatus that maintained them. Roles are
-- now answered at read time from the records that create them, unioned with
-- person_role_tags -- which becomes the only place a role is ever written.
--
-- The view is public.people_with_roles rather than the ticket's people_roles:
-- a bare (person_id + four flags) view cannot be embedded from people by
-- PostgREST -- there is no foreign key between them -- so every page would owe
-- a second query and a client-side merge. Carrying people.* instead means read
-- sites swap .from("people") for .from("people_with_roles") and keep their
-- filters and ordering unchanged; only the primary-contact embed is spelled
-- differently, for the reason recorded at the bottom of this file.

-- Safety net before the columns go. 20260903010000 already converted every
-- unbacked flag into a person_role_tags row, but create_donation_with_items'
-- anonymous branch has kept writing is_donor since, and a flag edited out of
-- band would otherwise be lost by the drop below. The insert half is
-- on-conflict-do-nothing, so a second pass is free.
select public.reconcile_person_role_flags();

-- The derivation probes nine tables by person id and not one of those columns
-- is indexed: Postgres does not index a foreign key for you, and
-- event_volunteers' unique (event_id, person_id) leads on the wrong column.
-- Stored flags hid that -- a trigger touches one row at a time -- but a view
-- evaluates the exists() per row in the result set, so without these the
-- directory becomes N sequential scans of donations and event_registrations
-- per request. person_role_tags is already covered by its own index.
create index if not exists donations_donor_id_idx
  on public.donations (donor_id);
create index if not exists monetary_donations_donor_id_idx
  on public.monetary_donations (donor_id);
create index if not exists giveaway_prizes_donor_person_id_idx
  on public.giveaway_prizes (donor_person_id);
create index if not exists event_sponsors_person_id_idx
  on public.event_sponsors (person_id);
create index if not exists event_registrations_person_id_idx
  on public.event_registrations (person_id);
create index if not exists event_volunteers_person_id_idx
  on public.event_volunteers (person_id);
create index if not exists volunteer_hours_person_id_idx
  on public.volunteer_hours (person_id);
create index if not exists volunteer_applications_person_id_idx
  on public.volunteer_applications (person_id);

-- sync_person_role_flags()'s recompute, minus the update: the same derivation,
-- read at query time instead of written by nine triggers.
--
-- security definer so a role never depends on the reader's access to the
-- evidence behind it. An event_coordinator holds people:view and finance:none;
-- a donor who reads as "not a donor" because donations is invisible to them
-- would be worse than no flag at all. This exposes exactly what the dropped
-- column exposed -- role membership, to anyone who can see the person -- and
-- nothing about the donation itself.
create function public.person_role_flags(p_person_id uuid)
returns table (
  is_donor boolean,
  is_sponsor boolean,
  is_volunteer boolean,
  is_attendee boolean
)
language sql
stable
parallel safe
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.donations where donor_id = p_person_id)
      or exists (select 1 from public.monetary_donations where donor_id = p_person_id)
      or exists (select 1 from public.giveaway_prizes where donor_person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'donor'),

    exists (select 1 from public.event_sponsors where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'sponsor'),

    -- An application counts, carried over from 20260903010000:
    -- submit_volunteer_application has always flagged the applicant at
    -- submission time, before any signup or logged hour exists.
    exists (select 1 from public.event_volunteers where person_id = p_person_id)
      or exists (select 1 from public.volunteer_hours where person_id = p_person_id)
      or exists (select 1 from public.volunteer_applications where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'volunteer'),

    exists (select 1 from public.event_registrations where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'attendee');
$$;

-- Required rather than convenience: whoever selects from the view below needs
-- execute on every function that view calls, security_invoker or not.
grant execute on function public.person_role_flags(uuid) to authenticated;

-- Retire the write side. Nothing can recompute a column that no longer exists;
-- person_role_tags stays, as the manual half of the derivation.
drop trigger sync_role_flags on public.donations;
drop trigger sync_role_flags on public.monetary_donations;
drop trigger sync_role_flags on public.giveaway_prizes;
drop trigger sync_role_flags on public.event_sponsors;
drop trigger sync_role_flags on public.event_registrations;
drop trigger sync_role_flags on public.event_volunteers;
drop trigger sync_role_flags on public.volunteer_hours;
drop trigger sync_role_flags on public.volunteer_applications;
drop trigger sync_role_flags on public.person_role_tags;
drop function public.sync_person_role_flags_from_row();
drop function public.reconcile_person_role_flags();

-- The tag write is now the whole operation: same body as 20260903020000
-- without the trailing recompute.
create or replace function public.set_person_role_tags(
  p_person_id uuid,
  p_roles text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('people', 'manage')
          or public.has_permission('people_intake', 'manage')) then
    raise exception 'Not authorized';
  end if;

  if not exists (select 1 from public.people where id = p_person_id) then
    raise exception 'No such person';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_roles, '{}'::text[])) as role
     where role not in ('donor', 'sponsor', 'volunteer', 'attendee')
  ) then
    raise exception 'Unknown role';
  end if;

  delete from public.person_role_tags
   where person_id = p_person_id
     and role <> all (coalesce(p_roles, '{}'::text[]));

  insert into public.person_role_tags (person_id, role)
  select p_person_id, role from unnest(coalesce(p_roles, '{}'::text[])) as role
  on conflict (person_id, role) do nothing;
end;
$$;

-- The last writer of the columns. Body from 20260824170000 with two changes:
-- the anonymous/no-email insert no longer sets is_donor, and the 'is_donor'
-- literal passed to resolve_or_create_person_by_email becomes null -- that
-- argument has been accepted-and-ignored since 20260903020000, and it named a
-- column that no longer exists. Either way the donations insert below is what
-- makes them a donor now.
--
-- The parameter itself stays on resolve_or_create_person_by_email: five
-- security-definer RPCs call it positionally, and register_for_event passes
-- p_instagram_handle after it, so dropping it means recreating all five bodies
-- for no behavior change. submit_volunteer_application (20260827010000) still
-- passes 'is_volunteer' for the same reason; it writes nothing.
create or replace function public.create_donation_with_items(
  p_donor_name text,
  p_donor_is_anonymous boolean,
  p_donor_source_type text,
  p_donor_email text,
  p_donor_phone text,
  p_donor_notes text,
  p_items jsonb,
  p_event_id uuid default null
) returns table(donation_id uuid, inventory_item_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donor_id uuid;
  v_donation_id uuid;
  v_item_id uuid;
  v_item jsonb;
  v_item_ids uuid[] := '{}';
begin
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one item is required';
  end if;

  if p_donor_is_anonymous or p_donor_email is null or p_donor_email = '' then
    insert into public.people (name, is_anonymous, source_type, email, phone, notes)
    values (p_donor_name, p_donor_is_anonymous, p_donor_source_type, p_donor_email, p_donor_phone, p_donor_notes)
    returning id into v_donor_id;
  else
    v_donor_id := public.resolve_or_create_person_by_email(
      p_donor_name, p_donor_email, p_donor_phone, p_donor_notes, p_donor_source_type, null
    );
  end if;

  insert into public.donations (donor_id, event_id)
  values (v_donor_id, p_event_id)
  returning id into v_donation_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.inventory_items
      (donation_id, description, size, type, gender, condition, face_value, notes)
    values (
      v_donation_id,
      v_item->>'description',
      v_item->>'size',
      v_item->>'type',
      v_item->>'gender',
      v_item->>'condition',
      nullif(v_item->>'face_value', '')::numeric,
      v_item->>'notes'
    )
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);

    insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason)
    values (v_item_id, 'received', 1, 'Donation intake');
  end loop;

  return query select v_donation_id, v_item_ids;
end;
$$;

grant execute on function public.create_donation_with_items to authenticated;

drop function public.sync_person_role_flags(uuid);

-- Safe now that every function body naming these columns has been replaced
-- above. plpgsql bodies are not dependency-tracked, so this drop would have
-- succeeded either way and left those RPCs to fail at runtime instead -- which
-- is why the replacements come first, not because Postgres insists.
alter table public.people
  drop column is_donor,
  drop column is_sponsor,
  drop column is_volunteer,
  drop column is_attendee;

-- The read model. security_invoker so the "people select" policy
-- (20260826000000: people:view, people_intake:manage, or
-- reimbursement_approvals:manage) still decides which rows a caller sees; only
-- the derivation above runs as definer.
--
-- One cross join lateral rather than four scalar functions: four references to
-- a scalar person_role_flags() in the target list would call it four times per
-- row, and a security definer function is never inlined.
--
-- `p.*` is expanded at creation time, so a later `alter table people add
-- column` does not appear here, and `create or replace view` cannot insert a
-- column ahead of the flags. Adding a people column the directory needs means
-- dropping and recreating this view in that migration.
create view public.people_with_roles
with (security_invoker = true) as
select
  p.*,
  f.is_donor,
  f.is_sponsor,
  f.is_volunteer,
  f.is_attendee
from public.people p
cross join lateral public.person_role_flags(p.id) f;

-- Read-only by construction: a lateral join is not auto-updatable, so every
-- write still goes to public.people. No anon grant -- unlike
-- public_gear_catalog this carries the whole directory row.
grant select on public.people_with_roles to authenticated;

-- A PostgREST computed relationship, so the directory and the person detail
-- page keep embedding an organization's primary contact in the same query.
--
-- PostgREST does trace the view's columns back to people's foreign keys, but
-- primary_contact_person_id points at people itself: from the view it can see
-- both directions of that one self-reference (this row's contact, and the rows
-- this row is the contact for) and no hint distinguishes them, so the plain
-- `primary_contact:primary_contact_person_id(...)` embed fails with PGRST201.
-- Naming the relationship as a function settles it. Security invoker, so the
-- contact is subject to the same people select policy as any other read.
create function public.primary_contact(public.people_with_roles)
returns setof public.people
rows 1
language sql
stable
as $$
  select * from public.people where id = $1.primary_contact_person_id;
$$;

grant execute on function public.primary_contact(public.people_with_roles) to authenticated;
