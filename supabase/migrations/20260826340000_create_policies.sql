-- Governance: policies (spec §5.12/§6, issue #38). Named organizational
-- policies (e.g. whistleblower, document retention, conflict of interest
-- policy itself), each with a category and effective date. Holds
-- substantive content the same way as `agendas`/`minutes`/`resolutions`/
-- `bylaws`: nullable `external_link`/`body_text`, no `file_attachment_id`
-- (in-app file upload is not planned, see docs/technical-spec.md §2).
--
-- Versioning: like `bylaws`, each revision of a named policy is its own row
-- (not a mutated "current" record), so history stays readable. `category`
-- is free text -- spec gives examples but no fixed taxonomy to check-
-- constrain against.

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  effective_date date not null,
  version text not null,
  external_link text,
  body_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index policies_name_effective_date_idx on public.policies (name, effective_date desc);

create trigger set_updated_at before update on public.policies
  for each row execute function public.set_updated_at();

alter table public.policies enable row level security;

create policy "policies select" on public.policies for select to authenticated
  using (public.has_permission('governance', 'view'));
create policy "policies insert" on public.policies for insert to authenticated
  with check (public.has_permission('governance', 'manage'));
create policy "policies update" on public.policies for update to authenticated
  using (public.has_permission('governance', 'manage')) with check (public.has_permission('governance', 'manage'));
create policy "policies delete" on public.policies for delete to authenticated
  using (public.has_permission('governance', 'manage'));

grant select, insert, update, delete on public.policies to authenticated;
