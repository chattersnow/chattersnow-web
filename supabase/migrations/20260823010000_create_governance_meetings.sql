-- Governance: meetings, agendas & minutes (spec §5.12/§6, issue #36).
-- `agendas` and `minutes` hold one flexible-content record per meeting
-- (external link and/or free text). File storage is out of scope for this
-- work (assume external links only) -- no `file_attachment_id` column, and
-- the `file_attachments` table (issue #34) is not built here. `resolutions`
-- (issue #37) is a future table keyed on `meeting_id`, not built here.

create table public.governance_meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_date timestamptz not null,
  meeting_type text not null check (meeting_type in ('board', 'committee', 'annual', 'other')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table public.governance_meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.governance_meetings(id) on delete cascade,
  person_id uuid not null references public.people(id),
  attended boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint governance_meeting_attendees_unique_person unique (meeting_id, person_id)
);

create table public.agendas (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null unique references public.governance_meetings(id) on delete cascade,
  external_link text,
  body_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table public.minutes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null unique references public.governance_meetings(id) on delete cascade,
  external_link text,
  body_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.governance_meetings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.governance_meeting_attendees
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.agendas
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.minutes
  for each row execute function public.set_updated_at();

alter table public.governance_meetings enable row level security;
alter table public.governance_meeting_attendees enable row level security;
alter table public.agendas enable row level security;
alter table public.minutes enable row level security;

create policy "governance_meetings select" on public.governance_meetings for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "governance_meetings insert" on public.governance_meetings for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "governance_meetings update" on public.governance_meetings for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "governance_meetings delete" on public.governance_meetings for delete to authenticated
  using (public.has_permission('governance', 'manage'));

create policy "governance_meeting_attendees select" on public.governance_meeting_attendees for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "governance_meeting_attendees insert" on public.governance_meeting_attendees for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "governance_meeting_attendees update" on public.governance_meeting_attendees for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "governance_meeting_attendees delete" on public.governance_meeting_attendees for delete to authenticated
  using (public.has_permission('governance', 'manage'));

create policy "agendas select" on public.agendas for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "agendas insert" on public.agendas for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "agendas update" on public.agendas for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "agendas delete" on public.agendas for delete to authenticated
  using (public.has_permission('governance', 'manage'));

create policy "minutes select" on public.minutes for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "minutes insert" on public.minutes for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "minutes update" on public.minutes for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "minutes delete" on public.minutes for delete to authenticated
  using (public.has_permission('governance', 'manage'));

grant select, insert, update, delete on public.governance_meetings to authenticated;
grant select, insert, update, delete on public.governance_meeting_attendees to authenticated;
grant select, insert, update, delete on public.agendas to authenticated;
grant select, insert, update, delete on public.minutes to authenticated;
