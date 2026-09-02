-- During/After-phase volunteer hours logged against an event. Lightweight,
-- event-scoped stand-in for the fuller volunteer_hours table described in
-- docs/technical-spec.md §5.17 (not yet built) — a `volunteer_role_type_id`
-- FK can be added later without breaking this.

create table public.event_volunteer_hours (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.people(id),
  hours numeric(5, 2) not null check (hours > 0),
  logged_date date not null default current_date,
  notes text,
  logged_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.event_volunteer_hours
  for each row execute function public.set_updated_at();

alter table public.event_volunteer_hours enable row level security;

grant select, insert, update, delete on public.event_volunteer_hours to authenticated;
