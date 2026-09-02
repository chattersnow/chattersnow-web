-- Many-to-many membership between people and organization people rows: a
-- person can belong to multiple organizations, and an organization can have
-- multiple people. primary_contact_person_id is left in place untouched (it
-- still models "the default contact to call first"); this table is the
-- general relationship on top of it.

create table public.person_organizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.people(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  constraint person_organizations_not_self check (organization_id <> person_id),
  constraint person_organizations_unique unique (organization_id, person_id)
);

alter table public.person_organizations enable row level security;

create policy "person_organizations select" on public.person_organizations for select to authenticated
  using (public.has_permission('people', 'view'));

create policy "person_organizations insert" on public.person_organizations for insert to authenticated
  with check (public.has_permission('people', 'manage'));

create policy "person_organizations update" on public.person_organizations for update to authenticated
  using (public.has_permission('people', 'manage')) with check (public.has_permission('people', 'manage'));

create policy "person_organizations delete" on public.person_organizations for delete to authenticated
  using (public.has_permission('people', 'manage'));

insert into public.person_organizations (organization_id, person_id, is_primary, created_by)
select id, primary_contact_person_id, true, created_by
from public.people
where primary_contact_person_id is not null;
