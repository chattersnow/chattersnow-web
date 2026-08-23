-- Org-wide volunteer hours log (spec §5.17/§6, issue #50): person, optional
-- event, date, hours, optional role type, and who logged the entry. Distinct
-- from the event-scoped event_volunteer_hours stand-in (which stays as-is,
-- per its own comment, until callers migrate) -- this is the general table
-- that feeds Volunteers > Participation and the future impact rollup (§5.15).
--
-- Access follows the same "log own hours" carve-out already used for
-- event_volunteer_hours: insert allowed via volunteers:manage (admin) or
-- volunteer_hours_logging:manage (a volunteer logging their own hours), but
-- select uses volunteers:view so admin/event_coordinator/volunteer can all
-- see the shared log -- matching the existing event_volunteer_hours policy
-- shape rather than adding new per-row ownership filtering.

create table public.volunteer_hours (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id),
  event_id uuid references public.events(id) on delete set null,
  volunteer_role_type_id uuid references public.volunteer_role_types(id) on delete set null,
  hours numeric(5, 2) not null check (hours > 0),
  logged_date date not null default current_date,
  notes text,
  logged_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.volunteer_hours
  for each row execute function public.set_updated_at();

alter table public.volunteer_hours enable row level security;

create policy "volunteer_hours select" on public.volunteer_hours for select to authenticated
  using (public.has_permission('volunteers', 'view'));
create policy "volunteer_hours insert" on public.volunteer_hours for insert to authenticated
  with check (public.has_permission('volunteers', 'manage') or public.has_permission('volunteer_hours_logging', 'manage'));
create policy "volunteer_hours update" on public.volunteer_hours for update to authenticated
  using (public.has_permission('volunteers', 'manage')) with check (public.has_permission('volunteers', 'manage'));
create policy "volunteer_hours delete" on public.volunteer_hours for delete to authenticated
  using (public.has_permission('volunteers', 'manage'));

grant select, insert, update, delete on public.volunteer_hours to authenticated;
