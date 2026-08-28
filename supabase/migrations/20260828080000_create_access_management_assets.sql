-- Access Management MVP (issue #424): assets -- an external technology
-- asset (a domain, a hosting account, a social account, etc.) belonging to a
-- service. Explicitly not a credential/secrets store: no password, API key,
-- token, or recovery-code column exists here or anywhere else in this
-- module. `mfa_status`/`credential_management_location` are manually-updated
-- descriptive fields, not verified against any service's real API state
-- (deferred to a later ticket per docs/technical-spec.md §17.5/§17.6).
--
-- `category` is a single flat enum (§17.4 -- explicitly rejected a nested
-- taxonomy: the org has under 25 assets total). `sensitivity` drives the
-- MFA/two-administrator/review-cadence expectations in the issue's
-- requirement matrix; those are enforced as UI-level flagging (dashboard
-- alerts), not DB constraints, so admins can record an asset before every
-- field is fully compliant.

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service_id uuid not null references public.services(id),
  category text not null check (
    category in (
      'domain', 'hosting', 'database', 'social', 'financial',
      'communication', 'productivity', 'other'
    )
  ),
  description text,
  url text check (url ~* '^https?://'),
  is_org_owned boolean not null default true,
  owner_person_id uuid references public.people(id),
  primary_admin_person_id uuid references public.people(id),
  backup_admin_person_id uuid references public.people(id),
  status text not null default 'active' check (status in ('active', 'inactive', 'decommissioned')),
  sensitivity text not null default 'medium' check (sensitivity in ('low', 'medium', 'high', 'critical')),
  mfa_required boolean not null default false,
  mfa_status text not null default 'unknown' check (mfa_status in ('enabled', 'disabled', 'unknown')),
  recovery_documented boolean not null default false,
  recovery_owner_person_id uuid references public.people(id),
  credential_management_location text not null default 'unknown' check (
    credential_management_location in ('password_manager', 'individual_account', 'unknown')
  ),
  last_reviewed date,
  next_review date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create index assets_service_id_idx on public.assets (service_id);
create index assets_status_idx on public.assets (status);
create index assets_next_review_idx on public.assets (next_review);

create trigger set_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

alter table public.assets enable row level security;

create policy "assets select" on public.assets for select to authenticated
  using (public.has_permission('access_management_assets', 'view'));
create policy "assets insert" on public.assets for insert to authenticated
  with check (public.has_permission('access_management_assets', 'manage'));
-- Update also accepts access_management_reviews:manage -- the "record a
-- review" action (last_reviewed/next_review) is a plain UPDATE on this
-- table, and the issue calls for review-only permission distinct from full
-- asset management (e.g. a board member who periodically reviews assets
-- without being able to add/remove them).
create policy "assets update" on public.assets for update to authenticated
  using (
    public.has_permission('access_management_assets', 'manage')
    or public.has_permission('access_management_reviews', 'manage')
  )
  with check (
    public.has_permission('access_management_assets', 'manage')
    or public.has_permission('access_management_reviews', 'manage')
  );
create policy "assets delete" on public.assets for delete to authenticated
  using (public.has_permission('access_management_assets', 'manage'));

grant select, insert, update, delete on public.assets to authenticated;

insert into public.audited_tables (table_name, pk_column) values ('assets', 'id');
create trigger audit_log_row after insert or update or delete on public.assets
  for each row execute function public.audit_log_row();
