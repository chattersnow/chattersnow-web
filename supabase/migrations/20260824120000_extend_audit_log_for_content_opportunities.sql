-- Content-opportunity status/field changes belong in the same audit trail
-- as donations/inventory/expenses/user_roles/app_settings/calendar_items
-- (issue #109). content_opportunities (20260824070000) was deliberately
-- built without this trigger -- its comment names this migration as the
-- follow-up that adds full multi-transition history (approvals,
-- rejections, publish/skip decisions, and any other field change) on top
-- of the status_changed_by/status_changed_at "last transition" columns it
-- already tracks.

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
  check (table_name in ('donations', 'inventory_items', 'inventory_movements', 'event_expenses', 'user_roles', 'app_settings', 'calendar_items', 'content_opportunities'));

create trigger audit_log_row after insert or update or delete on public.content_opportunities
  for each row execute function public.audit_log_row();
