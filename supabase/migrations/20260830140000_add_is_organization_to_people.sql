-- Explicit organization flag on people. Previously "org-ness" was only
-- implied by source_type or by having a primary_contact_person_id set;
-- this makes it a first-class, filterable attribute.

alter table public.people
  add column is_organization boolean not null default false;

update public.people
set is_organization = true
where source_type in ('organization', 'brand')
  or primary_contact_person_id is not null
  or id in (select organization_person_id from public.partnership_opportunities);
