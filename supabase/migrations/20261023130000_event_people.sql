-- #1693 (part of #1685): a guest reads the people on their granted event.
--
-- `people select` admits people: view, people_intake: manage and
-- reimbursement_approvals: manage. #1687 gave every event-scoped table a grant
-- arm but not `people`, so a guest with the Staff area reads an event's
-- event_staff rows and none of the people they point to: an `!inner` embed
-- drops the row, a plain one comes back null.
--
-- WHY A FUNCTION, NOT A GRANT ARM ON `people select`. RLS is per row, so an
-- arm would hand the guest every column of those rows: notes, the postal
-- address, the rider profile (riding discipline, experience levels), the
-- pending-email tokens. The cards show a name and, on some of them, an email
-- and phone. event_people() returns exactly that, and `people` itself stays
-- role-only -- so the directory, rider profiles and minors' data are closed
-- to a guest by construction rather than by every caller remembering.
--
-- WHICH PEOPLE. Those referenced by a row of the event the caller can read,
-- table by table through has_event_access(): a Staff grant reaches the
-- event's staff, volunteers and volunteer hours; Sponsors its sponsors and
-- their follow-up owners; Giveaway & goods its prize donors and ticket
-- purchasers; Details its lead and checklist owners; Impact & retro its retro
-- owners. Never the whole directory. A role holder reaches the same rows
-- through the role half of has_event_access(), so the function answers anyone
-- who can read the event's cards, not only guests.
--
-- CONTACT. Email and phone come back only for a person some row shows them
-- for (staff, volunteers, hours, sponsors, prize donors, the lead), as the
-- cards already do for a role holder. Owners and purchasers are names only.
--
-- Registrants are untouched: event_registrations carries its own name and
-- email, and the rider-profile embed stays on `people`, role-only.

create function public.event_people(p_event_id uuid)
returns table (
  id uuid,
  name text,
  preferred_name text,
  email text,
  phone text
)
language sql
security definer
set search_path = public
stable
as $$
  with tenant as (
    select (select public.current_tenant_id()) as id
  ),
  refs (person_id, shows_contact) as (
    select s.person_id, true
      from public.event_staff s, tenant
     where s.event_id = p_event_id and s.tenant_id = tenant.id
       and public.has_event_access(p_event_id, 'event_staff', 'view')
    union all
    select v.person_id, true
      from public.event_volunteers v, tenant
     where v.event_id = p_event_id and v.tenant_id = tenant.id
       and public.has_event_access(p_event_id, 'event_volunteers', 'view')
    union all
    select h.person_id, true
      from public.volunteer_hours h, tenant
     where h.event_id = p_event_id and h.tenant_id = tenant.id
       and public.has_event_access(p_event_id, 'volunteer_hours', 'view')
    union all
    select sp.person_id, true
      from public.event_sponsors sp, tenant
     where sp.event_id = p_event_id and sp.tenant_id = tenant.id
       and public.has_event_access(p_event_id, 'event_sponsors', 'view')
    union all
    select sp.follow_up_owner_person_id, false
      from public.event_sponsors sp, tenant
     where sp.event_id = p_event_id and sp.tenant_id = tenant.id
       and public.has_event_access(p_event_id, 'event_sponsors', 'view')
    union all
    select gp.donor_person_id, true
      from public.giveaway_prizes gp
      join public.giveaways gw on gw.id = gp.giveaway_id, tenant
     where gw.event_id = p_event_id and gp.tenant_id = tenant.id
       and public.has_event_access(p_event_id, 'giveaway_prizes', 'view')
    union all
    select ts.purchaser_person_id, false
      from public.giveaway_ticket_sales ts
      join public.giveaways gw on gw.id = ts.giveaway_id, tenant
     where gw.event_id = p_event_id and ts.tenant_id = tenant.id
       and public.has_event_access(p_event_id, 'giveaway_ticket_sales', 'view')
    union all
    select e.event_lead_id, true
      from public.events e, tenant
     where e.id = p_event_id and e.tenant_id = tenant.id
       and public.has_event_access(p_event_id, 'events', 'view')
    union all
    select c.owner_person_id, false
      from public.event_checklist_items c, tenant
     where c.event_id = p_event_id and c.tenant_id = tenant.id
       and public.has_event_access(p_event_id, 'event_checklist_items', 'view')
    union all
    select r.owner_person_id, false
      from public.event_retro_items r, tenant
     where r.event_id = p_event_id and r.tenant_id = tenant.id
       and public.has_event_access(p_event_id, 'event_retro_items', 'view')
  ),
  reached as (
    select person_id, bool_or(shows_contact) as shows_contact
      from refs
     where person_id is not null
     group by person_id
  )
  select p.id,
         p.name,
         p.preferred_name,
         case when reached.shows_contact then p.email end,
         case when reached.shows_contact then p.phone end
    from reached
    join public.people p on p.id = reached.person_id
   where p.tenant_id = (select public.current_tenant_id())
   order by p.name, p.id;
$$;

comment on function public.event_people(uuid) is
  'The people referenced by the rows of one event the caller can read (#1693): staff, volunteers, volunteer hours, sponsors and follow-up owners, prize donors, ticket purchasers, the lead, checklist and retro owners -- each source only when has_event_access() admits its table. Id, name and preferred name; email and phone only where a source card shows them. Lets a per-event guest see names without a grant arm on people, which would expose every column.';

revoke all on function public.event_people(uuid) from public, anon;
grant execute on function public.event_people(uuid) to authenticated;
