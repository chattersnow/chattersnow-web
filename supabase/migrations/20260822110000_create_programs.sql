-- Programs (spec §5.14/§6, issue #45): named, repeatable initiatives that
-- events optionally belong to, per the Programs -> Events model in
-- planning/ideas/RUNNING_PROGRAMS.md. Program naming/seed data is still
-- blocked on issue #1 (planning docs disagree on program names/counts), so
-- this migration builds the schema only -- no seed rows.

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  status text not null default 'active' check (status in ('active', 'pilot', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.programs
  for each row execute function public.set_updated_at();

alter table public.events
  add column program_id uuid references public.programs(id) on delete set null;

alter table public.programs enable row level security;

create policy "programs select" on public.programs for select to authenticated
  using (public.has_permission('programs', 'view'));
create policy "programs insert" on public.programs for insert to authenticated
  with check (public.has_permission('programs', 'manage'));
create policy "programs update" on public.programs for update to authenticated
  using (public.has_permission('programs', 'manage')) with check (public.has_permission('programs', 'manage'));
create policy "programs delete" on public.programs for delete to authenticated
  using (public.has_permission('programs', 'manage'));

grant select, insert, update, delete on public.programs to authenticated;

-- Register the programs resource (left out of the initial catalog in
-- 20260822090000 pending this build) and grant per the §5.3 entitlement
-- matrix: admin/event_coordinator manage, finance/board/volunteer view.
insert into public.resources (key, section, label, description, sort_order) values
  ('programs', 'Events', 'Programs', 'Named, repeatable initiatives that events can be tagged to', 45);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'manage'),
  ('event_coordinator', 'manage'),
  ('finance', 'view'),
  ('board', 'view'),
  ('volunteer', 'view')
) as v(role_name, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = 'programs';
