-- Governance: board members (spec §5.12/§6, issue #35). Links a `people`
-- record to a board term (role/title, term dates, active status). Multiple
-- historical rows per person are allowed (re-elected terms), but at most one
-- active term per person is enforced via a partial unique index.

create table public.board_members (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id),
  role_title text not null,
  term_start date not null,
  term_end date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create unique index board_members_one_active_per_person
  on public.board_members (person_id)
  where is_active;

create trigger set_updated_at before update on public.board_members
  for each row execute function public.set_updated_at();

alter table public.board_members enable row level security;

create policy "board_members select" on public.board_members for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "board_members insert" on public.board_members for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "board_members update" on public.board_members for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "board_members delete" on public.board_members for delete to authenticated
  using (public.has_permission('governance', 'manage'));

grant select, insert, update, delete on public.board_members to authenticated;
