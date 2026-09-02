-- Access Management MVP (issue #424): services lookup table -- the external
-- platform/vendor an asset lives on (Cloudflare, GitHub, Vercel, Supabase,
-- Zoho, etc.). Deliberately minimal per the requirements review (docs/
-- technical-spec.md §17): no credential/secret fields anywhere in this
-- module, ever.

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  website text check (website ~* '^https?://'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.services
  for each row execute function public.set_updated_at();

alter table public.services enable row level security;

-- Shares the access_management_assets resource (added in
-- 20260828100000_add_access_management_resources.sql) with assets and
-- access_grants -- a service is just a lookup value for assets, not a
-- separately-permissioned surface, matching the content_permissions/
-- content_calendar precedent (20260826140000).
create policy "services select" on public.services for select to authenticated
  using (public.has_permission('access_management_assets', 'view'));
create policy "services insert" on public.services for insert to authenticated
  with check (public.has_permission('access_management_assets', 'manage'));
create policy "services update" on public.services for update to authenticated
  using (public.has_permission('access_management_assets', 'manage'))
  with check (public.has_permission('access_management_assets', 'manage'));
create policy "services delete" on public.services for delete to authenticated
  using (public.has_permission('access_management_assets', 'manage'));

grant select, insert, update, delete on public.services to authenticated;

insert into public.audited_tables (table_name, pk_column) values ('services', 'id');
create trigger audit_log_row after insert or update or delete on public.services
  for each row execute function public.audit_log_row();
