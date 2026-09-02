-- Planning-phase volunteer sign-up list for an event, linking the shared
-- `people` directory the same way event_sponsors does. This is a lightweight,
-- event-scoped stand-in for the fuller volunteer-role catalog described in
-- docs/technical-spec.md §5.17, which is not yet built.

create table public.event_volunteers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.people(id),
  role text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint event_volunteers_unique_person unique (event_id, person_id)
);

create trigger set_updated_at before update on public.event_volunteers
  for each row execute function public.set_updated_at();

alter table public.event_volunteers enable row level security;

grant select, insert, update, delete on public.event_volunteers to authenticated;
