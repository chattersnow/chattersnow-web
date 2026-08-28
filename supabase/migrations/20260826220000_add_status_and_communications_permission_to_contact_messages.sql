-- In-portal ops inbox, contact-messages half (issue #173). contact_messages
-- (20260826180000) shipped with select gated on is_admin() and no
-- status/update path -- its own comment says the companion ops-inbox ticket
-- would introduce a dedicated resource and routing. This migration does
-- that: a `communications` resource (seeded to admin only for now, same as
-- every other resource -- Administration > Permissions can grant it to a
-- future front-desk/comms role without another migration) and a lightweight
-- status column so a message can be marked read/resolved, mirroring
-- volunteer_applications' status workflow.

-- Both updated_at and updated_by are required together: the shared
-- set_updated_at trigger function (20260819000000) writes new.updated_by as
-- well as new.updated_at, so a table using that trigger without an
-- updated_by column fails every update with "record \"new\" has no field
-- \"updated_by\"" (42703) -- see the sibling migration
-- 20260826230000_add_updated_by_to_volunteer_applications.sql, which fixes
-- the same mistake made for volunteer_applications.
alter table public.contact_messages
  add column status text not null default 'new'
    check (status in ('new', 'read', 'resolved')),
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references auth.users(id);

create trigger set_updated_at before update on public.contact_messages
  for each row execute function public.set_updated_at();

drop policy "contact_messages select" on public.contact_messages;

create policy "contact_messages select" on public.contact_messages for select to authenticated
  using (public.has_permission('communications', 'view'));
create policy "contact_messages update" on public.contact_messages for update to authenticated
  using (public.has_permission('communications', 'manage')) with check (public.has_permission('communications', 'manage'));

grant update on public.contact_messages to authenticated;

insert into public.resources (key, section, label, description, sort_order) values
  ('communications', 'Communications', 'Messages', 'Public contact-form submissions', 105);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'communications', 'manage')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;
