-- audit_log_row() has read `NEW.id`/`OLD.id` directly since 20260822120000,
-- which works for every audited table except deactivated_users
-- (20260824230000): its primary key column is user_id, not id. Any write to
-- deactivated_users -- including the deactivate/reactivate actions in
-- src/app/portal/(app)/administration/users/actions.ts -- has therefore been
-- crashing the audit trigger with "record \"new\" has no field \"id\""
-- (surfaced while seeding deactivated_users in supabase/seed.sql).
--
-- Fix: derive record_id via to_jsonb(...)->>'id', falling back to
-- ...->>'user_id' when the row has no id column. to_jsonb() works on any
-- row shape, so this is safe for every currently-audited table (all of
-- which have plain id columns and take the first branch) and for
-- deactivated_users going forward.
create or replace function public.audit_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_record_id := coalesce((to_jsonb(OLD) ->> 'id')::uuid, (to_jsonb(OLD) ->> 'user_id')::uuid);
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, v_record_id, 'delete', auth.uid(), to_jsonb(OLD), null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    v_record_id := coalesce((to_jsonb(NEW) ->> 'id')::uuid, (to_jsonb(NEW) ->> 'user_id')::uuid);
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, v_record_id, 'update', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    v_record_id := coalesce((to_jsonb(NEW) ->> 'id')::uuid, (to_jsonb(NEW) ->> 'user_id')::uuid);
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, v_record_id, 'insert', auth.uid(), null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;
