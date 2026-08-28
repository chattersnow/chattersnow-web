-- Access Management MVP (issue #424): access_grants -- who (a `people` row)
-- has access to a given asset, at what level, and whether it's been
-- verified. `account_identifier` is an email/username, never a secret. A
-- "review" (per docs/technical-spec.md §17.3) is just an audit_log entry
-- plus an updated last_verified/last_reviewed date -- there is no separate
-- persisted review-item table, and offboarding checklists are derived live
-- as `access_grants where person_id = X and status = 'active'` rather than
-- persisted as their own case object.

create table public.access_grants (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  person_id uuid not null references public.people(id),
  access_level text not null check (
    access_level in (
      'owner', 'admin', 'manager', 'editor', 'contributor',
      'viewer', 'billing', 'support', 'custom'
    )
  ),
  account_identifier text,
  purpose text,
  granted_at date not null default current_date,
  granted_by uuid default auth.uid() references auth.users(id),
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  expires_at date,
  last_verified date,
  revoked_at date,
  revoked_by uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

-- One active grant per person/asset pair -- re-granting after a revoke
-- inserts a fresh row rather than reactivating the old one, so the audit
-- trail keeps each grant/revoke cycle distinct.
create unique index access_grants_active_person_asset_key
  on public.access_grants (asset_id, person_id) where status = 'active';
create index access_grants_asset_id_idx on public.access_grants (asset_id);
create index access_grants_person_id_idx on public.access_grants (person_id);

create trigger set_updated_at before update on public.access_grants
  for each row execute function public.set_updated_at();

alter table public.access_grants enable row level security;

create policy "access_grants select" on public.access_grants for select to authenticated
  using (public.has_permission('access_management_assets', 'view'));
create policy "access_grants insert" on public.access_grants for insert to authenticated
  with check (public.has_permission('access_management_assets', 'manage'));
create policy "access_grants update" on public.access_grants for update to authenticated
  using (
    public.has_permission('access_management_assets', 'manage')
    or public.has_permission('access_management_reviews', 'manage')
  )
  with check (
    public.has_permission('access_management_assets', 'manage')
    or public.has_permission('access_management_reviews', 'manage')
  );
create policy "access_grants delete" on public.access_grants for delete to authenticated
  using (public.has_permission('access_management_assets', 'manage'));

grant select, insert, update, delete on public.access_grants to authenticated;

insert into public.audited_tables (table_name, pk_column) values ('access_grants', 'id');
create trigger audit_log_row after insert or update or delete on public.access_grants
  for each row execute function public.audit_log_row();
