-- Governance: partnership opportunity tracking (issue #498, dashboard
-- Organization follow-up to #68). Prospective partners are usually not yet
-- an established `people` row (no sponsor relationship exists until the
-- partnership closes), so the org/contact are plain text here rather than a
-- `people` FK -- unlike `owner_person_id`, which points at the internal
-- staff/board member driving the opportunity and reuses the same
-- responsible-person pattern as `annual_requirements`.

create table public.partnership_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  contact_name text,
  contact_email text,
  stage text not null default 'prospecting' check (stage in ('prospecting', 'contacted', 'proposal_sent', 'negotiating', 'closed_won', 'closed_lost')),
  next_step_date date,
  owner_person_id uuid references public.people(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index partnership_opportunities_owner_person_id_idx on public.partnership_opportunities (owner_person_id);

create trigger set_updated_at before update on public.partnership_opportunities
  for each row execute function public.set_updated_at();

alter table public.partnership_opportunities enable row level security;

create policy "partnership_opportunities select" on public.partnership_opportunities for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "partnership_opportunities insert" on public.partnership_opportunities for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "partnership_opportunities update" on public.partnership_opportunities for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "partnership_opportunities delete" on public.partnership_opportunities for delete to authenticated
  using (public.has_permission('governance', 'manage'));

grant select, insert, update, delete on public.partnership_opportunities to authenticated;
