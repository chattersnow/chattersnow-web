-- Content brief template catalog (spec §5.20/§6, issue #107): a small
-- starter library of brief structures (community spotlight, awareness/
-- community moment, partner spotlight) admins can revise over time without
-- altering already-completed briefs built from an earlier version.
--
-- Versioning is new to this migration set: content_brief_template_versions
-- rows are immutable by construction (select/insert only, no update/delete
-- policy or grant at all). Revising a template's fields always inserts a
-- new version row and repoints content_brief_templates.current_version_id
-- at it -- an existing version row, and therefore anything that already
-- references it, is never mutated.
--
-- The two tables are circular by design (a template points at its current
-- version, a version points back at its template), so the versions table is
-- created first with an unconstrained template_id column, and the FK back
-- to content_brief_templates is added via alter table once both tables
-- exist.

create table public.content_brief_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  version integer not null check (version > 0),
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  -- Nullable, like roles.created_by: this table's first rows are seeded by
  -- a migration (see the seed migration), which runs with no auth.uid()
  -- session -- app-created versions still get a value via the default.
  created_by uuid default auth.uid() references auth.users(id),
  unique (template_id, version)
);

create table public.content_brief_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  -- Nullable: a template is created in two steps (see actions.ts) -- insert
  -- the template row, insert its v1 version row, then point
  -- current_version_id at it. A row with current_version_id null is a
  -- mid-creation/incomplete template and is filtered out of the active-
  -- templates picker query.
  current_version_id uuid references public.content_brief_template_versions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Nullable, like roles.created_by: this table's first rows are seeded by
  -- a migration (see the seed migration), which runs with no auth.uid()
  -- session -- app-created templates still get a value via the default.
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

alter table public.content_brief_template_versions
  add constraint content_brief_template_versions_template_id_fkey
  foreign key (template_id) references public.content_brief_templates(id) on delete cascade;

create trigger set_updated_at before update on public.content_brief_templates
  for each row execute function public.set_updated_at();

alter table public.content_brief_templates enable row level security;
alter table public.content_brief_template_versions enable row level security;

-- Reuses content_calendar (issue #103/#106) -- same admin/event_coordinator
-- "manage" roles that already manage calendar items and briefs manage
-- templates too; a template is a linked part of the content-calendar
-- workflow, not a separately-permissioned surface, the same reasoning
-- content_opportunities used to reuse this resource instead of minting one.
create policy "content_brief_templates select" on public.content_brief_templates for select to authenticated
  using (public.has_permission('content_calendar', 'view'));
create policy "content_brief_templates insert" on public.content_brief_templates for insert to authenticated
  with check (public.has_permission('content_calendar', 'manage'));
create policy "content_brief_templates update" on public.content_brief_templates for update to authenticated
  using (public.has_permission('content_calendar', 'manage')) with check (public.has_permission('content_calendar', 'manage'));
create policy "content_brief_templates delete" on public.content_brief_templates for delete to authenticated
  using (public.has_permission('content_calendar', 'manage'));
grant select, insert, update, delete on public.content_brief_templates to authenticated;

-- Versions are immutable by construction: select + insert only, no update or
-- delete policy/grant at all, so revising a template's structure is always a
-- new row, never a mutation of a version an already-completed brief is
-- pinned to.
create policy "content_brief_template_versions select" on public.content_brief_template_versions for select to authenticated
  using (public.has_permission('content_calendar', 'view'));
create policy "content_brief_template_versions insert" on public.content_brief_template_versions for insert to authenticated
  with check (public.has_permission('content_calendar', 'manage'));
grant select, insert on public.content_brief_template_versions to authenticated;
