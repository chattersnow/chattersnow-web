-- Editing app_settings (e.g. the expense approval threshold) is a
-- governance-sensitive action, so it belongs in the same audit trail as
-- donations/inventory/expenses/user_roles rather than being silent.

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
  check (table_name in ('donations', 'inventory_items', 'inventory_movements', 'event_expenses', 'user_roles', 'app_settings'));

create trigger audit_log_row after insert or update or delete on public.app_settings
  for each row execute function public.audit_log_row();
