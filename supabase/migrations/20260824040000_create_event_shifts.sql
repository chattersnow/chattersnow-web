-- Time-bounded shifts within an event (e.g. basecamp AM / basecamp PM on a
-- multi-day trip), so a rotation of people can cover the same duty across a
-- day instead of one open-ended assignment for the whole event. Scoped to
-- event_volunteers for now (issue #70); event_staff (#61) doesn't exist yet,
-- so staff-side shift assignment is left for a follow-up once #61 lands.

create table public.event_shifts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  target_headcount integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint event_shifts_time_range check (ends_at > starts_at),
  constraint event_shifts_target_headcount_positive check (target_headcount is null or target_headcount > 0)
);

create trigger set_updated_at before update on public.event_shifts
  for each row execute function public.set_updated_at();

alter table public.event_shifts enable row level security;

grant select, insert, update, delete on public.event_shifts to authenticated;

create policy "event_shifts select" on public.event_shifts for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "event_shifts insert" on public.event_shifts for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "event_shifts update" on public.event_shifts for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
create policy "event_shifts delete" on public.event_shifts for delete to authenticated
  using (public.has_permission('events', 'manage'));

alter table public.event_volunteers
  add column shift_id uuid references public.event_shifts(id) on delete set null;
