-- #625. is_organization was never a role, and modelling it as one put an
-- exclusive, shape-changing attribute on the same axis as the additive ones.
--
-- Roles are many-per-person and additive: someone is a donor *and* a
-- volunteer, and #624 made them derived from the records that create them.
-- Entity type is one-per-person and exclusive, decides what the record even
-- looks like -- an organization has a logo, a website, a primary contact and
-- org memberships; an individual has a rider profile -- and is asserted by
-- staff, never derived. Sharing the axis meant the form offered meaningless
-- combinations and every further type would cost another boolean and another
-- set of `or` conditions.
--
-- person_type replaces it, check-constrained rather than an enum to match
-- source_type, condition, support_type and the rest of this schema. A future
-- 'household' (for family registrations) is then a constraint change. This is
-- CiviCRM's Individual / Household / Organization distinction, which they
-- likewise keep separate from contact roles.

alter table public.people
  add column person_type text not null default 'individual'
    check (person_type in ('individual', 'organization'));

update public.people
   set person_type = 'organization'
 where is_organization;

-- people_with_roles selects p.*, expanded at creation time, so the column
-- swap has to go through a drop and recreate -- flagged in 20260903030000 as
-- the cost of that shape. The computed relationship takes the view's
-- composite type as its argument, so it goes first and comes back after.
drop function public.primary_contact(public.people_with_roles);
drop view public.people_with_roles;

alter table public.people drop column is_organization;

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
