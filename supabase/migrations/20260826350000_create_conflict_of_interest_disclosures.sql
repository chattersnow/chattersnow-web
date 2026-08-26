-- Governance: conflict-of-interest disclosures (spec §5.12/§6, issue #39).
-- Per-person annual disclosure statements. Linked directly to `people`
-- (not `board_members`) since disclosures are person-level per spec §5.12
-- and not every discloser is necessarily an active board_members row at
-- read time. Holds its substantive content the same way as
-- `agendas`/`minutes`/`resolutions`: nullable `external_link`/`body_text`,
-- no `file_attachment_id` (issue #34 closed won't-do; file uploads are
-- permanently out of scope, not just deferred).

create table public.conflict_of_interest_disclosures (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id),
  disclosure_year integer not null,
  on_file_date date,
  notes text,
  external_link text,
  body_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (person_id, disclosure_year)
);

create index conflict_of_interest_disclosures_person_id_idx on public.conflict_of_interest_disclosures (person_id);

create trigger set_updated_at before update on public.conflict_of_interest_disclosures
  for each row execute function public.set_updated_at();

alter table public.conflict_of_interest_disclosures enable row level security;

create policy "conflict_of_interest_disclosures select" on public.conflict_of_interest_disclosures for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "conflict_of_interest_disclosures insert" on public.conflict_of_interest_disclosures for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "conflict_of_interest_disclosures update" on public.conflict_of_interest_disclosures for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "conflict_of_interest_disclosures delete" on public.conflict_of_interest_disclosures for delete to authenticated
  using (public.has_permission('governance', 'manage'));

grant select, insert, update, delete on public.conflict_of_interest_disclosures to authenticated;
