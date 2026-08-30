-- Let an organization-type people row (a sponsor or partner org) point at
-- the actual individual who is its contact, rather than that org record
-- carrying its own name/email/phone with no link to a real person. Self-
-- referencing and nullable so it works for any people row without depending
-- on source_type.

alter table public.people
  add column primary_contact_person_id uuid references public.people(id),
  add constraint people_primary_contact_not_self check (primary_contact_person_id is distinct from id);
