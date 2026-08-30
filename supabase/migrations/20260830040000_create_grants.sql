-- Governance: grant application tracking (issue #498, dashboard
-- Organization follow-up to #68). No automation/recurrence, same as
-- annual_requirements and nonprofit_status_milestones -- a grant that
-- reopens next cycle is a new row.

create table public.grants (
  id uuid primary key default gen_random_uuid(),
  funder_name text not null,
  amount numeric(12, 2),
  application_deadline date not null,
  status text not null default 'planned' check (status in ('planned', 'submitted', 'awarded', 'declined')),
  owner_person_id uuid references public.people(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index grants_owner_person_id_idx on public.grants (owner_person_id);

create trigger set_updated_at before update on public.grants
  for each row execute function public.set_updated_at();

alter table public.grants enable row level security;

create policy "grants select" on public.grants for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "grants insert" on public.grants for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "grants update" on public.grants for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "grants delete" on public.grants for delete to authenticated
  using (public.has_permission('governance', 'manage'));

grant select, insert, update, delete on public.grants to authenticated;
