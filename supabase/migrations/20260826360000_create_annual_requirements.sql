-- Governance: annual compliance requirements (spec §5.12/§6, issue #39).
-- A plain list of instances (e.g. "2026 Form 990"), not an automated
-- recurrence engine -- next year's item is a new row created manually, same
-- as nonprofit_status_milestones has no automation. Status enum mirrors
-- nonprofit_status_milestones' not_started/in_progress/done vocabulary.
-- Holds its substantive content the same way as `agendas`/`minutes`/
-- `resolutions`: nullable `external_link`/`body_text`, no
-- `file_attachment_id` (issue #34 closed won't-do; file uploads are
-- permanently out of scope, not just deferred).

create table public.annual_requirements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  due_date date not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  completed_at timestamptz,
  responsible_person_id uuid references public.people(id),
  external_link text,
  body_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index annual_requirements_responsible_person_id_idx on public.annual_requirements (responsible_person_id);

create trigger set_updated_at before update on public.annual_requirements
  for each row execute function public.set_updated_at();

alter table public.annual_requirements enable row level security;

create policy "annual_requirements select" on public.annual_requirements for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "annual_requirements insert" on public.annual_requirements for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "annual_requirements update" on public.annual_requirements for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "annual_requirements delete" on public.annual_requirements for delete to authenticated
  using (public.has_permission('governance', 'manage'));

grant select, insert, update, delete on public.annual_requirements to authenticated;
