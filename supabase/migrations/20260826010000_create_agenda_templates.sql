-- Agenda template catalog for governance meetings (issue #166): a versioned,
-- reusable structure for the standing sections of a board meeting agenda
-- (the seven "Ongoing Board Items" subsections). Mirrors the content-brief
-- template pattern (20260824085000_create_content_brief_templates.sql):
-- revising a template's sections always inserts a new version row and
-- repoints agenda_templates.current_version_id at it, so an agenda already
-- pinned to an earlier version (see 20260826030000) is never retroactively
-- changed.
--
-- The two tables are circular by design (a template points at its current
-- version, a version points back at its template), so the versions table is
-- created first with an unconstrained template_id column, and the FK back
-- to agenda_templates is added via alter table once both tables exist.

create table public.agenda_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  version integer not null check (version > 0),
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  unique (template_id, version)
);

create table public.agenda_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  current_version_id uuid references public.agenda_template_versions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

alter table public.agenda_template_versions
  add constraint agenda_template_versions_template_id_fkey
  foreign key (template_id) references public.agenda_templates(id) on delete cascade;

create trigger set_updated_at before update on public.agenda_templates
  for each row execute function public.set_updated_at();

alter table public.agenda_templates enable row level security;
alter table public.agenda_template_versions enable row level security;

-- Reuses the governance resource (issue #36) -- an agenda template is a
-- linked part of the governance meetings workflow, not a separately
-- permissioned surface, the same reasoning content_brief_templates used to
-- reuse content_calendar's resource instead of minting one.
create policy "agenda_templates select" on public.agenda_templates for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "agenda_templates insert" on public.agenda_templates for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "agenda_templates update" on public.agenda_templates for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "agenda_templates delete" on public.agenda_templates for delete to authenticated
  using (public.has_permission('governance', 'manage'));
grant select, insert, update, delete on public.agenda_templates to authenticated;

-- Versions are immutable by construction: select + insert only, no update or
-- delete policy/grant at all, so revising a template's sections is always a
-- new row, never a mutation of a version an already-saved agenda is pinned
-- to.
create policy "agenda_template_versions select" on public.agenda_template_versions for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "agenda_template_versions insert" on public.agenda_template_versions for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
grant select, insert on public.agenda_template_versions to authenticated;
