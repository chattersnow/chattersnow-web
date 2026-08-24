-- Governance: meeting action items & decisions (issue #93).
-- Two new list-based additions to a meeting record, alongside the existing
-- attendees/agenda/minutes (issue #36). Distinct from `resolutions` (issue
-- #37, not built here): decisions here are informal highlights, not formal
-- motions with mover/seconder/vote outcome. No FK to a discrete agenda item
-- since `agendas` is a single flexible-content blob per meeting, not a list.

create table public.governance_meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.governance_meetings(id) on delete cascade,
  description text not null,
  owner_person_id uuid not null references public.people(id),
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create table public.governance_meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.governance_meetings(id) on delete cascade,
  description text not null,
  decision_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.governance_meeting_action_items
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.governance_meeting_decisions
  for each row execute function public.set_updated_at();

alter table public.governance_meeting_action_items enable row level security;
alter table public.governance_meeting_decisions enable row level security;

create policy "governance_meeting_action_items select" on public.governance_meeting_action_items for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "governance_meeting_action_items insert" on public.governance_meeting_action_items for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "governance_meeting_action_items update" on public.governance_meeting_action_items for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "governance_meeting_action_items delete" on public.governance_meeting_action_items for delete to authenticated
  using (public.has_permission('governance', 'manage'));

create policy "governance_meeting_decisions select" on public.governance_meeting_decisions for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "governance_meeting_decisions insert" on public.governance_meeting_decisions for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "governance_meeting_decisions update" on public.governance_meeting_decisions for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "governance_meeting_decisions delete" on public.governance_meeting_decisions for delete to authenticated
  using (public.has_permission('governance', 'manage'));

grant select, insert, update, delete on public.governance_meeting_action_items to authenticated;
grant select, insert, update, delete on public.governance_meeting_decisions to authenticated;
