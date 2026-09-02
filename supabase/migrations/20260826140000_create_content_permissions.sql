-- Community-story consent record (issue #113 scope item 1; anticipated in
-- docs/technical-spec.md §6). One-to-one with content_opportunities, same
-- shape as content_opportunities' own one-to-one link to calendar_items:
-- a spotlight-type brief either has its permitted-use/on-file record or it
-- doesn't, there's no notion of multiple concurrent consent records for one
-- brief.

create table public.content_permissions (
  id uuid primary key default gen_random_uuid(),
  content_opportunity_id uuid not null unique references public.content_opportunities(id) on delete cascade,
  permitted_use text not null,
  usage_limits text,
  consent_on_file_at date not null,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id)
);

create trigger set_updated_at before update on public.content_permissions
  for each row execute function public.set_updated_at();

alter table public.content_permissions enable row level security;

-- Same content_calendar resource as content_opportunities -- consent is
-- just a linked part of a brief, not a separately-permissioned surface.
create policy "content_permissions select" on public.content_permissions for select to authenticated
  using (public.has_permission('content_calendar', 'view'));
create policy "content_permissions insert" on public.content_permissions for insert to authenticated
  with check (public.has_permission('content_calendar', 'manage'));
create policy "content_permissions update" on public.content_permissions for update to authenticated
  using (public.has_permission('content_calendar', 'manage')) with check (public.has_permission('content_calendar', 'manage'));
create policy "content_permissions delete" on public.content_permissions for delete to authenticated
  using (public.has_permission('content_calendar', 'manage'));
grant select, insert, update, delete on public.content_permissions to authenticated;

-- Audit coverage, same pattern as 20260824120000 (content_opportunities).
-- Wired in the same migration that creates the table -- unlike
-- content_opportunities/#109, there's no cross-issue reason to defer it.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'public.audit_log'::regclass and contype = 'c' and conname like '%table_name%';

  if v_constraint_name is not null then
    execute format('alter table public.audit_log drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.audit_log
  add constraint audit_log_table_name_check
  check (table_name in ('donations', 'inventory_items', 'inventory_movements', 'event_expenses', 'user_roles', 'app_settings', 'calendar_items', 'pending_role_grants', 'content_opportunities', 'deactivated_users', 'event_revenue', 'reimbursements', 'content_permissions'));

create trigger audit_log_row after insert or update or delete on public.content_permissions
  for each row execute function public.audit_log_row();
