-- Governance: resolutions (spec §5.12/§6, issue #37).
-- Unlike `agendas`/`minutes` (one flexible-content blob per meeting, FK
-- required), `resolutions` is a list and its `meeting_id` is optional -- a
-- resolution can be recorded without being tied to a specific meeting.
-- `on delete set null` (not cascade) so a resolution outlives a deleted
-- meeting record. Holds its substantive content the same way as
-- `agendas`/`minutes`: nullable `external_link`/`body_text`, no
-- `file_attachment_id` (issue #34 deferred past the initial release).

create table public.resolutions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.governance_meetings(id) on delete set null,
  motion_text text not null,
  mover_person_id uuid not null references public.people(id),
  seconder_person_id uuid references public.people(id),
  vote_outcome text not null default 'pending' check (vote_outcome in ('pending', 'passed', 'failed', 'tabled')),
  effective_date date,
  external_link text,
  body_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index resolutions_meeting_id_idx on public.resolutions (meeting_id);

create trigger set_updated_at before update on public.resolutions
  for each row execute function public.set_updated_at();

alter table public.resolutions enable row level security;

create policy "resolutions select" on public.resolutions for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "resolutions insert" on public.resolutions for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "resolutions update" on public.resolutions for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "resolutions delete" on public.resolutions for delete to authenticated
  using (public.has_permission('governance', 'manage'));

grant select, insert, update, delete on public.resolutions to authenticated;
