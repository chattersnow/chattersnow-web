-- Volunteer role-type catalog (spec §5.17/§6, issue #49): named job types
-- (e.g. Ride Buddy, Event Setup, Basecamp Staffing) that events and hours
-- entries can be tagged with. No seed rows -- the actual set of role/skill
-- values is an open org decision (see issue #49), so this launches empty
-- and admin fills it in, same as programs did for issue #45.

create table public.volunteer_role_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.volunteer_role_types
  for each row execute function public.set_updated_at();

alter table public.volunteer_role_types enable row level security;

create policy "volunteer_role_types select" on public.volunteer_role_types for select to authenticated
  using (public.has_permission('volunteers', 'view'));
create policy "volunteer_role_types insert" on public.volunteer_role_types for insert to authenticated
  with check (public.has_permission('volunteers', 'manage'));
create policy "volunteer_role_types update" on public.volunteer_role_types for update to authenticated
  using (public.has_permission('volunteers', 'manage')) with check (public.has_permission('volunteers', 'manage'));
create policy "volunteer_role_types delete" on public.volunteer_role_types for delete to authenticated
  using (public.has_permission('volunteers', 'manage'));

grant select, insert, update, delete on public.volunteer_role_types to authenticated;
