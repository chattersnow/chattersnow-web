-- Public event registration (issue #25, spec §5.2/§9): anonymous visitors
-- register for a published, registration-enabled event from its public
-- detail page. Falls under the existing "events" resource for staff access,
-- same as event_sponsors/event_logistics/giveaways (20260822100000) rather
-- than a new resource.
--
-- Anonymous visitors never get direct table access (no anon policy/grant
-- here): if they did, they could bypass the capacity/deadline/window
-- validation and insert arbitrary rows straight through PostgREST. Instead
-- all public registrations go through the register_for_event() RPC
-- (20260823100000), a security-definer function that validates and inserts
-- atomically and never exposes other registrants' rows.

create table public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  party_size integer not null default 1 check (party_size >= 1),
  notes text,
  created_at timestamptz not null default now()
);

create unique index event_registrations_event_email_key
  on public.event_registrations (event_id, lower(email));

alter table public.event_registrations enable row level security;

create policy "event_registrations select" on public.event_registrations for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "event_registrations delete" on public.event_registrations for delete to authenticated
  using (public.has_permission('events', 'manage'));

grant select, insert, delete on public.event_registrations to authenticated;
