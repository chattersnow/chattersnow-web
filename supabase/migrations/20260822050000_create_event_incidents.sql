-- During-phase incident log, one row per incident. Restricted to
-- admin/event_coordinator only (see the RLS migration) since incident
-- detail is sensitive operational data, unlike the rest of the events
-- cluster which finance/volunteer can view.

create table public.event_incidents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  description text not null,
  severity text not null default 'minor' check (severity in ('minor', 'moderate', 'serious')),
  people_involved text,
  reported_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.event_incidents
  for each row execute function public.set_updated_at();

alter table public.event_incidents enable row level security;

grant select, insert, update, delete on public.event_incidents to authenticated;
