-- Issue #602, follow-up within the same PR. Two gaps in what landed above.
--
-- 1. Changing a rule to 'enforce' is the most consequential action in this
--    feature -- it is what turns a job that reports into a job that destroys --
--    and retention_policies recorded only updated_by/updated_at. That is the
--    last person to touch the row, not a history: two changes in a week leave
--    no trace of the first, and "who turned this on, and when" is exactly the
--    question a board or an auditor asks. The earlier design kept these in
--    app_settings, which is audited (20260823060000); moving to a typed table
--    for the per-rule kill switch dropped that without meaning to.
--
--    Registering the table restores it. audit_log then holds the before/after
--    of every mode change, attributed, alongside the run log that records what
--    each run did -- the two halves of the same story.
insert into public.audited_tables (table_name, pk_column) values
  ('retention_policies', 'policy_key');

create trigger audit_log_row after insert or update or delete on public.retention_policies
  for each row execute function public.audit_log_row();

-- audit_log.record_id is a uuid and retention_policies is keyed by a text
-- policy_key, so the generic trigger cannot store this table's identity there.
-- Rather than widen record_id across every audited table, derive a stable uuid
-- from the key: uuid_generate_v5 with the DNS namespace is deterministic, so the
-- same policy always lands on the same record_id and the audit log's
-- (table_name, record_id) index still groups a policy's history together. The
-- readable key is in old_data/new_data, which is what the audit log UI shows.
create or replace function public.audit_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pk_column text;
  v_old_id uuid;
  v_new_id uuid;
begin
  select pk_column into v_pk_column
    from public.audited_tables where table_name = TG_TABLE_NAME;

  if TG_TABLE_NAME = 'retention_policies' then
    if TG_OP <> 'INSERT' then
      execute format('select extensions.uuid_generate_v5(extensions.uuid_ns_dns(), ($1).%I::text)', v_pk_column)
        into v_old_id using OLD;
    end if;
    if TG_OP <> 'DELETE' then
      execute format('select extensions.uuid_generate_v5(extensions.uuid_ns_dns(), ($1).%I::text)', v_pk_column)
        into v_new_id using NEW;
    end if;
  else
    if TG_OP <> 'INSERT' then
      execute format('select ($1).%I', v_pk_column) into v_old_id using OLD;
    end if;
    if TG_OP <> 'DELETE' then
      execute format('select ($1).%I', v_pk_column) into v_new_id using NEW;
    end if;
  end if;

  if TG_OP = 'DELETE' then
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, v_old_id, 'delete', auth.uid(), to_jsonb(OLD), null);
    return OLD;
  elsif TG_OP = 'UPDATE' then
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, v_new_id, 'update', auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else
    insert into public.audit_log (table_name, record_id, action, actor_id, old_data, new_data)
    values (TG_TABLE_NAME, v_new_id, 'insert', auth.uid(), null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;

-- 2. src/lib/retention.ts duplicates each period so /privacy can render the
--    published prose while the purge reads its clock from retention_policies.
--    Nothing structural stopped those two diverging -- someone edits a period in
--    a migration, the page keeps promising the old one, and #602's own failure
--    reappears one layer down. An integration test now compares them, and this
--    is what lets it: Postgres normalises an interval on the way in ('3 months'
--    becomes '3 mons'), so the comparison has to be interval arithmetic rather
--    than string equality.
create function public.retention_period_matches(
  p_policy_key text,
  p_period text,
  p_secondary_period text default null
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.retention_policies
     where policy_key = p_policy_key
       and period = p_period::interval
       and secondary_period is not distinct from p_secondary_period::interval
  );
$$;

grant execute on function public.retention_period_matches to authenticated;
