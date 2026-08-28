-- Issue #421: audit_log.table_name was guarded by a single check constraint
-- that every migration auditing a new table had to drop and retype in full
-- (rewritten 10 times across history so far). That has already caused two
-- production bugs:
--   1. 20260824120000 retyped the list from an earlier snapshot and silently
--      dropped 'pending_role_grants' (added two migrations prior), breaking
--      every write to it until 20260824141000 restored it one migration
--      later.
--   2. audit_log_row() read NEW.id/OLD.id directly, assuming every audited
--      table's primary key is named `id`. deactivated_users is keyed by
--      user_id, so every write to it crashed the trigger until
--      20260826120000 added an id/user_id coalesce -- which still needs a
--      new hardcoded branch for the next oddly-keyed table, and would
--      silently insert a NULL record_id if neither branch matched.
--
-- Replace the literal allowlist with a small registry table both bugs can
-- key off of. Onboarding a newly-audited table becomes one additive insert
-- (can't accidentally omit or drop an earlier entry the way a full
-- drop+recreate check constraint can), and `select * from audited_tables`
-- becomes the actual answer to "what's in the audited set" instead of
-- reading migration history in order.

create table public.audited_tables (
  table_name text primary key,
  pk_column text not null default 'id'
);

-- Not part of the portal's client-facing API surface: read only by
-- audit_log_row() (security definer, bypasses RLS) and by migrations
-- (table owner, also bypasses RLS). No policies, no grants.
alter table public.audited_tables enable row level security;

-- Backfill with the current audited set (every table with an
-- `audit_log_row` trigger as of this migration) and each one's identity
-- column.
insert into public.audited_tables (table_name, pk_column) values
  ('donations', 'id'),
  ('inventory_items', 'id'),
  ('inventory_movements', 'id'),
  ('event_expenses', 'id'),
  ('user_roles', 'id'),
  ('app_settings', 'id'),
  ('calendar_items', 'id'),
  ('pending_role_grants', 'id'),
  ('content_opportunities', 'id'),
  ('deactivated_users', 'user_id'),
  ('event_revenue', 'id'),
  ('reimbursements', 'id'),
  ('content_permissions', 'id');

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
  add constraint audit_log_table_name_fkey
  foreign key (table_name) references public.audited_tables(table_name);

-- Resolve record_id via the registered pk_column instead of a hardcoded
-- id/user_id coalesce. Raises when the audited table has no trigger-table
-- registry entry, or when the resolved pk_column doesn't exist on the row,
-- instead of silently inserting a NULL record_id.
create or replace function public.audit_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pk_column text;
  v_row jsonb;
  v_record_id uuid;
begin
  select pk_column into v_pk_column
  from public.audited_tables
  where table_name = TG_TABLE_NAME;

  if v_pk_column is null then
    raise exception 'audit_log_row: % is not registered in audited_tables', TG_TABLE_NAME;
  end if;

  v_row := to_jsonb(case when TG_OP = 'DELETE' then OLD else NEW end);

  if not (v_row ? v_pk_column) then
    raise exception 'audit_log_row: % has no column % registered as its pk_column', TG_TABLE_NAME, v_pk_column;
  end if;

  v_record_id := (v_row ->> v_pk_column)::uuid;

  if TG_OP = 'DELETE' then
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, v_record_id, 'delete', auth.uid(), to_jsonb(OLD), null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, v_record_id, 'update', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, v_record_id, 'insert', auth.uid(), null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;
