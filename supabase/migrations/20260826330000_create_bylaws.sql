-- Governance: bylaws (spec §5.12/§6, issue #38). Holds substantive content
-- the same way as `agendas`/`minutes`/`resolutions`: nullable
-- `external_link`/`body_text`, no `file_attachment_id` -- an in-app file
-- upload solution is not planned, see docs/technical-spec.md §2 (issue #34,
-- closed as won't-do).
--
-- Versioning: each amendment is its own row rather than mutating one shared
-- "current" record, matching the app's existing "records with history, not
-- silent overwrites" philosophy (spec §2 goal 4). The row with the greatest
-- `effective_date` is the current bylaws; older rows remain readable, giving
-- the amendment-history view for free without a separate history table.

create table public.bylaws (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  effective_date date not null,
  amendment_summary text,
  external_link text,
  body_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index bylaws_effective_date_idx on public.bylaws (effective_date desc);

create trigger set_updated_at before update on public.bylaws
  for each row execute function public.set_updated_at();

alter table public.bylaws enable row level security;

create policy "bylaws select" on public.bylaws for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "bylaws insert" on public.bylaws for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "bylaws update" on public.bylaws for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "bylaws delete" on public.bylaws for delete to authenticated
  using (public.has_permission('governance', 'manage'));

grant select, insert, update, delete on public.bylaws to authenticated;
