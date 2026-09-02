-- Planning-phase logistics: one row per event. Kept as a separate table
-- (rather than more `events` columns) since it's a distinct concern with
-- its own tab, matching the event_sponsors/event_expenses pattern.

create table public.event_logistics (
  event_id uuid primary key references public.events(id) on delete cascade,
  meeting_point text,
  gear_requirements text,
  transportation text,
  food text,
  supplies text,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.event_logistics
  for each row execute function public.set_updated_at();

alter table public.event_logistics enable row level security;

grant select, insert, update, delete on public.event_logistics to authenticated;
