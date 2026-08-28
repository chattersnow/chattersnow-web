-- Append-only audit trail (spec §5.11, issue #18): a single audit_log table
-- fed by AFTER-row triggers on the tables in the v1 audited set, rather than
-- application-level writes scattered across each mutating RPC/server action.
-- A trigger fires regardless of whether the write came through a security
-- definer RPC (create_donation_with_items, record_event_distribution) or a
-- direct .from().insert/update() call, so coverage can't be silently
-- skipped by a write path that forgets to log. Adding a table to the
-- audited set later only needs a new CREATE TRIGGER statement plus widening
-- the table_name check constraint, not a new function.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null
    check (table_name in ('donations', 'inventory_items', 'inventory_movements', 'event_expenses', 'user_roles')),
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  actor_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index audit_log_table_record_idx on public.audit_log (table_name, record_id);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index audit_log_actor_id_idx on public.audit_log (actor_id);

-- security definer + owned by the migration role (bypasses RLS), same
-- reasoning as has_permission/is_admin (20260822090000): this needs to
-- write into audit_log regardless of the invoking session's own grants on
-- that table, which intentionally has no insert policy for anyone.
-- auth.uid() still resolves correctly here even when the trigger fires
-- inside another security definer function (create_donation_with_items,
-- record_event_distribution): it reads session-scoped JWT-claim GUCs, not
-- the currently executing role.
create or replace function public.audit_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, OLD.id, 'delete', auth.uid(), to_jsonb(OLD), null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, NEW.id, 'update', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, NEW.id, 'insert', auth.uid(), null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;

create trigger audit_log_row after insert or update or delete on public.donations
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.inventory_items
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.inventory_movements
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.event_expenses
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.user_roles
  for each row execute function public.audit_log_row();

alter table public.audit_log enable row level security;

-- Read-only for administration:manage (the only level ever granted for the
-- administration resource, see 20260822090000). No insert/update/delete
-- policy for any role, and no write grants below: only audit_log_row()
-- (security definer, bypasses RLS) can write, making this append-only from
-- the API's perspective.
create policy "audit_log select" on public.audit_log
  for select to authenticated
  using (public.has_permission('administration', 'manage'));

grant select on public.audit_log to authenticated;
