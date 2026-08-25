-- 20260824120000_extend_audit_log_for_content_opportunities.sql dropped and
-- recreated audit_log_table_name_check to add 'content_opportunities', but
-- its replacement list omitted 'pending_role_grants' (added earlier by
-- 20260824060000_create_pending_role_grants.sql). That silently broke every
-- insert/update/delete on pending_role_grants -- including the "Stage
-- access" admin action -- since the audit_log_row() trigger on that table
-- fails the check constraint. Restore 'pending_role_grants' alongside
-- 'content_opportunities'.

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
  check (table_name in ('donations', 'inventory_items', 'inventory_movements', 'event_expenses', 'user_roles', 'app_settings', 'calendar_items', 'pending_role_grants', 'content_opportunities'));
