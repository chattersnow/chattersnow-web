-- Generic, reusable key-value settings store (issue #29), so org-wide
-- configuration values — starting with the expense approval threshold added
-- in the next migration — live in data instead of being hardcoded, and can
-- change without a deploy. Any future setting reuses this same table rather
-- than needing its own migration.

-- `id` (not `key`) is the primary key so the generic audit_log_row() trigger
-- (which reads NEW.id/OLD.id, same as every other audited table) works here
-- unmodified; `key` stays the lookup column the app actually queries by.
create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.resources (key, section, label, description, sort_order) values
  ('system_settings', 'Administration', 'System settings', 'Org-wide configuration values, e.g. the expense approval threshold', 125);

insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'system_settings', 'manage'),
  ('event_coordinator', 'system_settings', 'none'),
  ('finance', 'system_settings', 'none'),
  ('board', 'system_settings', 'manage'),
  ('volunteer', 'system_settings', 'none')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;

alter table public.app_settings enable row level security;

-- Read: anyone who can manage the settings themselves, plus anyone who
-- needs to read a setting's value to do their job (submitters/approvers
-- need the expense threshold; finance_approvals doesn't exist as a
-- resource until the next migration, so it's added there once it does).
create policy "app_settings select" on public.app_settings for select to authenticated
  using (public.has_permission('system_settings', 'manage') or public.has_permission('event_expenses', 'manage'));

create policy "app_settings insert" on public.app_settings for insert to authenticated
  with check (public.has_permission('system_settings', 'manage'));
create policy "app_settings update" on public.app_settings for update to authenticated
  using (public.has_permission('system_settings', 'manage')) with check (public.has_permission('system_settings', 'manage'));

grant select, insert, update on public.app_settings to authenticated;

-- Placeholder value only. The real number is an open board/leadership
-- decision (see planning/governance/roles-and-responsibilities.md and
-- issue #13, not yet recorded in planning/decisions/) — this seed just
-- gives the mechanism something to read until that decision lands and an
-- admin/board user updates it via Administration > System Settings.
insert into public.app_settings (key, value) values
  ('finance.expense_approval_threshold', to_jsonb(500.00::numeric));
