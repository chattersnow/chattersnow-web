-- Recipient becomes the seventh derived person role (#1073).
--
-- A person's record showed what they gave and never what they got. Every other
-- activity earns a derived role and a history card -- donations, shifts,
-- registrations -- while receiving gear earned nothing, though both
-- `inventory_movements.recipient_person_id` (20260823150000) and
-- `gear_requests.person_id` (20260913230000) are populated on every
-- distribution and every public request. So a staffer with a rider's record
-- open could see that they registered for an event, and not that the
-- organization handed them a jacket last season -- the one question the gear
-- library exists to answer.
--
-- **A request counts, not only a distribution.** The flag reads "has asked or
-- received" rather than "has received": a pending request is not yet a
-- receipt, but a person with an open request is exactly who a staffer has the
-- record open for, and a requester whose only history is a request submitted
-- this morning is the case where the context is worth most. The card keeps the
-- two apart so a request never reads as a handover.
--
-- The word is the tenant's and the key is ours, as #911 set up: "recipient" is
-- nonprofit vocabulary and a shop's equivalent is a customer, a lending
-- library's a borrower. `is_recipient` is what this schema and the routes mean;
-- the registry in src/lib/person-roles.ts holds only what a reader sees.
--
-- What this deliberately does not add: a Recipients segment on /portal/people.
-- Recipients are aid recipients rather than counterparties, and this schema
-- already treats their data as more sensitive than anyone else's --
-- 20260905170000 clears their request notes on retention, 20260907150000
-- redacts them out of snapshots, 20260905130000 exists so a rider can have
-- their profile deleted on request. None of the other six roles has any of
-- that. A browsable roster of beneficiaries is a different product decision and
-- nobody has asked for it. The directory's Roles column declines the flag for
-- the same reason, and for a second one the TypeScript side documents: the flag
-- is `security definer` and the card's rows are not, so the chip would be
-- visible to every holder of people:view while the rows behind it would not be.

-- ---------------------------------------------------------------------------
-- 1. The indexes the derivation probes
-- ---------------------------------------------------------------------------

-- Once per row of the directory, so `recipient_person_id` needs one of its own;
-- it has had no index since 20260823150000 added the column. Partial, because
-- the column is null on every movement that is not a handover or a hold -- the
-- large majority -- and an `exists` probe never looks for null.
create index if not exists inventory_movements_recipient_person_id_idx
  on public.inventory_movements (recipient_person_id)
  where recipient_person_id is not null;

-- gear_requests already carries gear_requests_person_id_idx (20260913230000).

-- ---------------------------------------------------------------------------
-- 2. The manual assertion
-- ---------------------------------------------------------------------------

-- Recipient can be asserted by hand like the other six. The derived half only
-- knows what this system recorded, and gear handed over before it existed --
-- or at a giveaway somebody wrote down on paper -- is still something a staffer
-- needs to be able to say. It stays a tag rather than a fabricated movement,
-- so nothing invents inventory history to carry a claim about a person.
alter table public.person_role_tags
  drop constraint person_role_tags_role_check;
alter table public.person_role_tags
  add constraint person_role_tags_role_check
  check (role in ('donor', 'sponsor', 'volunteer', 'attendee', 'staff', 'partner', 'recipient'));

-- Six other roles now, not five.
comment on column public.person_role_tags.is_public is
  'Sponsor tags only (#1024): show this organization on the tenant''s public sponsor wall at /support/sponsorship, with no event anywhere. The second opt-in beside event_sponsors.is_public, and the only one available to a sponsor who supports the organization rather than an event. Meaningless on the other six roles, which reach no public surface; set_person_role_tags refuses a public role it was not also asked to assert.';

-- ---------------------------------------------------------------------------
-- 3. The flag
-- ---------------------------------------------------------------------------

-- person_role_flags gains an OUT column, which is a return-type change rather
-- than a replaceable body, so the function and everything built on it come
-- down and go back up together -- the sequence 20260905020000 established when
-- Partner arrived. The body below carries forward the tenant scoping
-- 20260906090000 added: called directly with another tenant's person id, every
-- flag is false.
drop function public.primary_contact(public.people_with_roles);
drop view public.people_with_roles;
drop function public.person_role_flags(uuid);

create function public.person_role_flags(p_person_id uuid)
returns table (
  is_donor boolean, is_sponsor boolean, is_volunteer boolean,
  is_attendee boolean, is_staff boolean, is_partner boolean,
  is_recipient boolean
)
language sql
security definer
set search_path = public
stable
parallel safe
as $$
  with scope as (
    select exists (
      select 1 from public.people
       where id = p_person_id and tenant_id = (select public.current_tenant_id())
    ) as ok
  )
  select
    ok and (
      exists (select 1 from public.donations where donor_id = p_person_id)
      or exists (select 1 from public.monetary_donations where donor_id = p_person_id)
      or exists (select 1 from public.giveaway_prizes where donor_person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'donor')
    ),

    ok and (
      exists (select 1 from public.event_sponsors where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'sponsor')
    ),

    ok and (
      exists (select 1 from public.event_volunteers where person_id = p_person_id)
      or exists (select 1 from public.volunteer_hours where person_id = p_person_id)
      or exists (select 1 from public.volunteer_applications where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'volunteer')
    ),

    ok and (
      exists (select 1 from public.event_registrations where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'attendee')
    ),

    ok and (
      exists (select 1 from public.event_staff where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'staff')
    ),

    ok and (
      exists (select 1 from public.partnership_opportunities
               where organization_person_id = p_person_id
                 and stage = 'closed_won')
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'partner')
    ),

    -- Gear that left, or a request for gear that has not. Every movement type
    -- counts, not just `distributed`: `reserved` is a hold placed by a public
    -- request, a giveaway prize allocation writes one too (20260901070000),
    -- and `recipient_person_id` is set on none of the movements that are not
    -- about a person. The retention purge nulls both columns
    -- (20260905170000), so an anonymized requester's flag goes out with the
    -- data behind it rather than outliving it.
    ok and (
      exists (select 1 from public.inventory_movements
               where recipient_person_id = p_person_id)
      or exists (select 1 from public.gear_requests where person_id = p_person_id)
      or exists (select 1 from public.person_role_tags
                  where person_id = p_person_id and role = 'recipient')
    )
  from scope;
$$;

grant execute on function public.person_role_flags(uuid) to authenticated;

create view public.people_with_roles
with (security_invoker = true) as
select
  p.*,
  f.is_donor,
  f.is_sponsor,
  f.is_volunteer,
  f.is_attendee,
  f.is_staff,
  f.is_partner,
  f.is_recipient
from public.people p
cross join lateral public.person_role_flags(p.id) f;

grant select on public.people_with_roles to authenticated;

create function public.primary_contact(public.people_with_roles)
returns setof public.people
rows 1
language sql
stable
as $$
  select * from public.people where id = $1.primary_contact_person_id;
$$;

grant execute on function public.primary_contact(public.people_with_roles) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The writer
-- ---------------------------------------------------------------------------

-- The person form's role checkboxes write through this, so it has to accept the
-- new value or Recipient would be uncheckable from the directory. Same
-- signature as the current copy (20260913070000), so this is a body-only
-- replace; only the validated list changes.
create or replace function public.set_person_role_tags(
  p_person_id uuid,
  p_roles text[],
  p_public_roles text[] default '{}'::text[]
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

  if not exists (
    select 1 from public.people
     where id = p_person_id and tenant_id = (select public.current_tenant_id())
  ) then
    raise exception 'No such person';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_roles, '{}'::text[])) as role
     where role not in ('donor', 'sponsor', 'volunteer', 'attendee', 'staff', 'partner', 'recipient')
  ) then
    raise exception 'Unknown role';
  end if;

  -- A public role the caller is not also asserting has nowhere to live: the
  -- delete below would remove the row the flag belongs to. Refusing makes the
  -- contradiction impossible to express rather than silently dropping half of
  -- it.
  if exists (
    select 1 from unnest(coalesce(p_public_roles, '{}'::text[])) as role
     where role <> all (coalesce(p_roles, '{}'::text[]))
  ) then
    raise exception 'Public role not asserted';
  end if;

  delete from public.person_role_tags
   where person_id = p_person_id
     and role <> all (coalesce(p_roles, '{}'::text[]));

  insert into public.person_role_tags (person_id, role, is_public)
  select
    p_person_id,
    role,
    role = any (coalesce(p_public_roles, '{}'::text[]))
  from unnest(coalesce(p_roles, '{}'::text[])) as role
  on conflict (person_id, role) do update
    set is_public = excluded.is_public;
end;
$$;

grant execute on function public.set_person_role_tags(uuid, text[], text[]) to authenticated;
