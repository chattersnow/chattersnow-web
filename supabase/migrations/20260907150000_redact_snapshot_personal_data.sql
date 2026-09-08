-- Issue #720: the personal data the purge deliberately could not reach.
--
-- #602 enforces the published retention periods on the live rows. Two stores
-- hold copies of the same personal data and were left alone, because both are
-- append-only by design and neither has a clock of its own:
--
--   audit_log.old_data / new_data -- a full snapshot of every audited row at the
--     moment it changed, so purging an audited table writes the old values
--     *into* the audit log. Deleting an unclaimed invitation (rule G) removes
--     the live invitation email and records it in the snapshot in the same
--     statement.
--   person_merges.merged_snapshot / survivor_before -- whole copies of a people
--     row, kept indefinitely, because people is not audited and this is the only
--     record that the merged person existed.
--
-- The answer is redaction, not deletion, and it is a board decision recorded at
-- planning/decisions/2026-09-07-audit-trail-and-merge-history-retention.md: the
-- organization keeps the audit trail permanently for governance, security,
-- audit, insurance and legal purposes -- which is a commitment about the shape
-- of the record (which table, which row, what kind of change, which account,
-- when), not about the participant's email address sitting inside it. Clearing
-- the personal values seven years on keeps the first and removes the second,
-- where deleting the entry would give up both.
--
-- Both rules ship in dry_run and are PROPOSED, not board-approved, exactly as
-- portal_accounts and pending_role_grants did in 20260905090000.
--
-- Append-only survives this. audit_log still has no update policy and no update
-- grant; the rewrite happens inside run_retention_purge(), which is security
-- definer, owned by the migration role, and granted to nobody -- the same
-- pattern check_rate_limit and the purge itself already use. What a reader gains
-- is redacted_at: a scrubbed snapshot is distinguishable from one that never
-- held the field, which an in-place rewrite would otherwise destroy.

alter table public.audit_log add column redacted_at timestamptz;
alter table public.person_merges add column redacted_at timestamptz;

comment on column public.audit_log.redacted_at is
  'When the personal values inside old_data/new_data were cleared by the retention job (#720). Null means the snapshot is as it was written.';
comment on column public.person_merges.redacted_at is
  'When the personal values inside merged_snapshot/survivor_before were cleared by the retention job (#720). Null means the snapshots are as they were written.';

-- Partial indexes on exactly the sweep's predicate. They shrink as rows are
-- redacted, which is the opposite of how audit_log's other indexes behave, and
-- is what keeps a nightly scan over a table that only ever grows affordable.
create index audit_log_unredacted_idx on public.audit_log (occurred_at)
  where redacted_at is null;
create index person_merges_unredacted_idx on public.person_merges (merged_at)
  where redacted_at is null;

-- Which keys in a snapshot are personal.
--
-- Not audited_tables.redacted_columns (20260905160000), which is the other half
-- of the same problem: a column listed there is stripped by the trigger and
-- never recorded, which is right for data on a short published clock and wrong
-- for data the log needs as evidence of what happened. This register is for the
-- second kind -- recorded, kept, and cleared on a clock -- and it also has to
-- cover people, which carries no audit trigger at all and reaches the retention
-- job only through person_merges.
--
-- Written down rather than decided at redaction time, for two reasons. Matching
-- on column names would be wrong in both directions on this schema --
-- inventory_items.name is a jacket and events.name is an event, neither of them
-- a person, while people.preferred_mountain is personal and matches no pattern
-- at all -- and a register makes "what did we scrub, and why that" answerable by
-- reading one table instead of a function body.
--
-- The line drawn, and it is the line the decision record argues for: a value
-- that identifies a natural person (a name, an email address, a phone number, a
-- handle, an account identifier), an attribute of one (pronouns, a rider
-- profile), or free text a member of the public wrote through an intake form.
-- Ids are deliberately NOT registered: the person row an id points at is
-- anonymized by the same job, so the id then reveals nothing, and keeping it is
-- what still lets the log explain why a movement or a donation exists. Amounts,
-- statuses, quantities and dates are the audit trail's whole point and stay.
--
-- people is here despite not being audited: person_merges snapshots people rows,
-- and the eleven columns below are exactly the set rules D1 and D2 of the purge
-- clear on a live person, so a redacted snapshot loses exactly what the live row
-- would have lost and nothing more.
create table public.retention_snapshot_personal_columns (
  table_name text not null,
  column_name text not null,
  primary key (table_name, column_name)
);

-- Read only by the redaction helper (security definer, bypasses RLS) and by
-- migrations. Same treatment as audited_tables (20260828060000) and
-- retention_purgeable_person_refs (20260905090000): no policies, no grants.
alter table public.retention_snapshot_personal_columns enable row level security;

insert into public.retention_snapshot_personal_columns (table_name, column_name) values
  ('people', 'name'),
  ('people', 'preferred_name'),
  ('people', 'email'),
  ('people', 'phone'),
  ('people', 'instagram_handle'),
  ('people', 'pronouns'),
  ('people', 'notes'),
  ('people', 'riding_discipline'),
  ('people', 'ski_experience_level'),
  ('people', 'snowboard_experience_level'),
  ('people', 'preferred_mountain'),
  -- The case #720 opens with: rule G deletes the live invitation and the delete
  -- trigger writes the address it just removed into old_data.
  ('pending_role_grants', 'email'),
  ('pending_role_grants', 'name'),
  -- Free text a member of the public wrote on the donation form. The financial
  -- figures on the same rows are untouched -- donation records are exempt from
  -- retention and stay legible in the log.
  --
  -- inventory_movements.notes is deliberately absent: 20260905160000 registered
  -- it in audited_tables.redacted_columns, so the gear requester's prose never
  -- reaches a snapshot in the first place. That register and this one answer
  -- different questions -- "never record this" versus "record it, and stop
  -- holding it after seven years" -- and a column belongs in exactly one of
  -- them. Which one depends on whether the audit trail needs the value as
  -- evidence at all: it does not need what someone wrote about their boot size,
  -- and it does need which address an invitation went to.
  ('donations', 'notes'),
  -- A winner recorded by name and contact detail rather than as a person id,
  -- which is exactly why this one needs registering.
  ('giveaway_winners', 'winner_name'),
  ('giveaway_winners', 'winner_contact'),
  -- Usually a person's work email address at the service the grant is for.
  ('access_grants', 'account_identifier');

-- A registered column that does not exist is a typo that would otherwise scrub
-- nothing and say nothing, for years. CI runs every migration against a fresh
-- database, so this fails there rather than in production.
do $$
declare
  v_missing text;
begin
  select string_agg(c.table_name || '.' || c.column_name, ', ')
    into v_missing
    from public.retention_snapshot_personal_columns c
   where not exists (
     select 1 from information_schema.columns i
      where i.table_schema = 'public'
        and i.table_name = c.table_name
        and i.column_name = c.column_name
   );

  if v_missing is not null then
    raise exception 'retention_snapshot_personal_columns names columns that do not exist: %', v_missing;
  end if;
end $$;

-- Is there anything left in these snapshots to scrub?
--
-- What keeps the sweep from rewriting and re-reporting the same entries every
-- night forever: a key that is present holding jsonb null -- because the column
-- was null when the row was written, or because a previous run already cleared
-- it -- is not personal data, and `?` alone cannot tell the difference.
create function public.retention_snapshot_has_personal_data(
  p_table_name text,
  p_first jsonb,
  p_second jsonb default null
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.retention_snapshot_personal_columns c
      cross join lateral (values (p_first), (p_second)) as s(data)
     where c.table_name = p_table_name
       and s.data -> c.column_name is not null
       and s.data -> c.column_name <> 'null'::jsonb
  );
$$;

-- Clear the registered keys, keep everything else, keep the shape.
--
-- The key stays and takes jsonb null rather than being dropped: a reader of the
-- portal's audit-log diff can still see which fields a change touched, and a
-- missing key and a scrubbed one would otherwise be indistinguishable from a
-- column that did not exist yet when the entry was written.
create function public.retention_redact_snapshot(
  p_table_name text,
  p_data jsonb
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_data is null then null
    else p_data || coalesce((
      select jsonb_object_agg(c.column_name, 'null'::jsonb)
        from public.retention_snapshot_personal_columns c
       where c.table_name = p_table_name
         and p_data ? c.column_name
    ), '{}'::jsonb)
  end;
$$;

-- The guard against the failure this design actually has: an audited table added
-- next season whose personal columns nobody registered, whose snapshots are then
-- kept in full forever while the page reports the rule as applied.
--
-- Deliberately narrow. Only the patterns that are personal on this schema
-- whatever table they appear on -- an email address, a phone number, an
-- Instagram handle, pronouns -- so the answer stays actionable; `name` and
-- `notes` match dozens of columns that are about jackets and events, and a guard
-- nobody can keep at zero is a guard nobody reads. An integration test asserts
-- this returns nothing.
create function public.retention_unregistered_personal_columns()
returns table (table_name text, column_name text)
language sql
stable
security definer
set search_path = public
as $$
  select i.table_name::text, i.column_name::text
    from information_schema.columns i
   where i.table_schema = 'public'
     and (i.table_name in (select a.table_name from public.audited_tables a)
          or i.table_name = 'people')
     and i.column_name ~ '(email|phone|instagram|pronoun)'
     and not exists (
       select 1 from public.retention_snapshot_personal_columns c
        where c.table_name = i.table_name
          and c.column_name = i.column_name
     )
     -- Already handled at write time, and better: a column listed there never
     -- reaches a snapshot at all (20260905160000).
     and not exists (
       select 1 from public.audited_tables a
        where a.table_name = i.table_name
          and i.column_name = any(a.redacted_columns)
     )
   order by 1, 2;
$$;

-- 'redacted' joins the vocabulary of the run log: a snapshot rewritten in place
-- is neither 'anonymized' (which this schema uses for a live row that keeps its
-- aggregate) nor 'cleared'.
alter table public.retention_run_tables
  drop constraint retention_run_tables_action_check,
  add constraint retention_run_tables_action_check
    check (action in ('deleted', 'anonymized', 'cleared', 'backfilled', 'redacted', 'skipped'));

-- One row per tenant, dry_run like everything else. New tenants inherit these
-- through seed_tenant_retention_policies() (20260906160000), which copies the
-- oldest tenant's rules, so nothing there needs editing.
insert into public.retention_policies (tenant_id, policy_key, label, period, description)
select t.id, 'audit_log_snapshots', 'Audit trail row snapshots', interval '7 years',
       'Measured from the audited change. The entry is never deleted: its table, record, action, actor and timestamp are kept permanently, and the personal values inside the before/after snapshots are cleared. PROPOSED, not board-approved.'
  from public.tenants t
union all
select t.id, 'person_merge_snapshots', 'Merged person snapshots', interval '7 years',
       'Measured from the merge. The record that the merge happened (who merged whom, when, and what moved) is kept permanently; the personal values inside the two person snapshots are cleared. PROPOSED, not board-approved.'
  from public.tenants t;

-- The purge itself. The body of 20260906170000 with two rules added at the end
-- of the tenant loop, re-emitted in full for the reason that migration gives:
-- this function is one plpgsql block, so adding a rule is a rewrite of the whole
-- thing rather than a patch. The signature is unchanged, so create or replace is
-- enough -- no drop, and the pg_cron entry (20260905140000) keeps resolving to
-- this one.

create or replace function public.run_retention_purge(
  p_dry_run boolean default true,
  p_as_of timestamptz default now(),
  p_trigger text default 'cron',
  p_tenant_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_run_id uuid;
  v_result_run_id uuid;
  v_ids uuid[];
  v_person_ids uuid[];
  v_failed boolean := false;
  v_period interval;
  v_secondary interval;
  v_mode text;
  v_enforce boolean;
begin
  -- A manual dry run from the portal must not interleave with the nightly job.
  -- Transaction-scoped, so it releases on commit or rollback either way.
  if not pg_try_advisory_xact_lock(hashtext('retention_purge')) then
    return null;
  end if;

  -- Rule H, once for the sweep rather than once per tenant. rate_limit_hits is
  -- keyed by IP and route and has no tenant_id, so there is nothing to scope --
  -- but its policy row is per-tenant now, and purge_rate_limit_hits() takes the
  -- strictest clock any tenant has set. Each tenant's run still logs the rule,
  -- inside the loop, so the Data Retention page explains it as before.
  if not p_dry_run then
    perform public.purge_rate_limit_hits(p_as_of);
  end if;

  for v_tenant in
    select t.id
      from public.tenants t
     where t.status = 'active'
       and (p_tenant_id is null or t.id = p_tenant_id)
     order by t.created_at
  loop
    v_failed := false;

    insert into public.retention_runs (tenant_id, as_of, dry_run, trigger, triggered_by, status)
    values (v_tenant, p_as_of, p_dry_run, p_trigger, auth.uid(), 'running')
    returning id into v_run_id;

    if v_tenant = p_tenant_id then
      v_result_run_id := v_run_id;
    end if;

    -- Each rule gets its own exception block. A plpgsql exception block is a
    -- subtransaction, so a rule that fails rolls back only itself and the run
    -- finishes as 'partial' with the error recorded against that rule -- rather
    -- than one bad clock discarding the work of the other eight.

    -- H. Abuse-protection records. Not mode-gated; see purge_rate_limit_hits.
    --
    -- The only rule with no tenant dimension: rate_limit_hits is keyed by IP and
    -- route, has no tenant_id, and is correctly global (20260906010000 lists it
    -- among the twelve tables that stay platform-wide). The sweep therefore runs
    -- the purge once, above the loop, and each tenant's run logs the rule so the
    -- page still explains it rather than appearing to have skipped it.
    begin
      perform public.retention_log(v_run_id, 'rate_limit_hits', 'rate_limit_hits',
        case when p_dry_run then 'skipped' else 'deleted' end, '{}');
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rate_limit_hits', 'rate_limit_hits', 'skipped', sqlerrm);
    end;

    -- A. Contact form messages. The one table here that is safe to delete
    -- outright: nothing has a foreign key to it and it carries no audit trigger.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'contact_messages' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'skipped', '{}');
      else
        v_ids := array(
          select id from public.contact_messages
           where tenant_id = v_tenant and created_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.contact_messages where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'contact_messages', 'contact_messages', 'skipped', sqlerrm);
    end;

    -- C. Event registrations: strip the person, keep the row.
    --
    -- name and email are NOT NULL (20260823090000), so they take sentinels rather
    -- than nulls. '' is the established "no email" value -- both unique indexes
    -- here are partial (WHERE email <> '', WHERE person_id IS NOT NULL, see
    -- 20260901010000), which is exactly what makes anonymizing many rows of one
    -- event safe. party_size, checked_in_at and the three *_at_event snapshot
    -- columns survive untouched: they are the impact figures this rule exists to
    -- preserve.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'event_registrations' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'skipped', '{}');
      else
        v_ids := array(
          select r.id
            from public.event_registrations r
            join public.events e on e.id = r.event_id
           where r.tenant_id = v_tenant
             and coalesce(e.ends_at, e.starts_at) < p_as_of - v_period
             and (r.name <> 'Removed' or r.person_id is not null
                  or r.phone is not null or r.notes is not null
                  or r.instagram_handle is not null or r.pronouns is not null)
        );
        perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.event_registrations
             set name = 'Removed',
                 email = '',
                 phone = null,
                 notes = null,
                 instagram_handle = null,
                 pronouns = null,
                 person_id = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'event_registrations', 'event_registrations', 'skipped', sqlerrm);
    end;

    -- B. Volunteer applications. Two clocks: the published policy is "2 years
    -- after your last activity with us, or 1 year if the application is withdrawn
    -- or declined". There is no 'withdrawn' status in the check constraint
    -- (20260827000000) -- 'declined' and 'closed' are the states that mean it,
    -- and status is what selects the clock.
    --
    -- The main clock reads person_last_activity_at, not just the row's
    -- updated_at, so a 'placed' application belonging to a volunteer who is still
    -- turning up does not expire merely because nobody has edited the record.
    begin
      select period, secondary_period, mode into v_period, v_secondary, v_mode
        from public.retention_policies
         where policy_key = 'volunteer_applications' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.volunteer_applications a
           where a.tenant_id = v_tenant
             and case
                   when a.status in ('declined', 'closed')
                     then a.updated_at < p_as_of - v_secondary
                   else greatest(a.updated_at,
                                 public.person_last_activity_at(a.person_id))
                          < p_as_of - v_period
                 end
        );
        perform public.retention_log(v_run_id, 'volunteer_applications', 'volunteer_applications', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.volunteer_applications where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', sqlerrm);
    end;

    -- E. Gear requests. The movement row is inventory history and stays; only the
    -- requester goes -- the link, and now the free text they wrote on the request
    -- form, which #721 moved off people.notes and onto the movement. Their name,
    -- email and phone are still not on the movement -- request_gear_items() puts
    -- those on a people row via resolve_or_create_person_by_email() -- so
    -- unlinking here is what lets the person rule below reach them.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'gear_requests' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.inventory_movements m
           where m.tenant_id = v_tenant
             and m.recipient_person_id is not null
             and m.movement_type in ('reserved', 'distributed')
             and m.occurred_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.inventory_movements set recipient_person_id = null, notes = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'gear_requests', 'inventory_movements', 'skipped', sqlerrm);
    end;

    -- D1. Rider profiles, and the backfill that has to come first.
    --
    -- The impact RPCs read coalesce(registration.*_at_event, the live people row)
    -- (20260904140000), and the snapshot trigger only stamps on the check-in
    -- transition (20260904120000). So any registration checked in before that
    -- migration, or whose person had no profile at the time, still resolves
    -- through people. Clearing the person's rider columns without stamping the
    -- snapshot first would silently change beginner counts on events that closed
    -- years ago. Backfill, then clear, in that order, in one transaction.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'rider_profiles' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
           where p.tenant_id = v_tenant
             and p.riding_discipline is not null
             and public.person_last_activity_at(p.id) < p_as_of - v_period
        );

        v_ids := array(
          select r.id
            from public.event_registrations r
            join public.people p on p.id = r.person_id
           where r.tenant_id = v_tenant
             and r.checked_in_at is not null
             and r.riding_discipline_at_event is null
             and p.riding_discipline is not null
             and p.id = any(v_person_ids)
        );
        perform public.retention_log(v_run_id, 'rider_profiles', 'event_registrations', 'backfilled', v_ids);

        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.event_registrations r
             set riding_discipline_at_event = p.riding_discipline,
                 ski_experience_level_at_event = p.ski_experience_level,
                 snowboard_experience_level_at_event = p.snowboard_experience_level
            from public.people p
           where p.id = r.person_id
             and r.tenant_id = v_tenant
             and r.checked_in_at is not null
             and r.riding_discipline_at_event is null
             and p.riding_discipline is not null
             and p.id = any(v_person_ids);
        end if;

        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'cleared', v_person_ids);

        -- All four columns in one statement: people_ski_level_requires_ski and
        -- people_snowboard_level_requires_snowboard (20260901050000) fire if a
        -- level outlives its discipline, which is why merge_people() handles them
        -- as a group too.
        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.people
             set riding_discipline = null,
                 ski_experience_level = null,
                 snowboard_experience_level = null,
                 preferred_mountain = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
    end;

    -- D2. Anonymize the person, when nothing else needs them.
    --
    -- Runs last of the person rules on purpose: retention_person_is_retained()
    -- has to observe the state after C, B and E dropped their references. In a
    -- dry run those references are still there, so this count is conservative --
    -- it reports the people who are *already* free, not the ones the same run
    -- would free. Say so on the page rather than trying to simulate it.
    --
    -- The row is never deleted. ~40 foreign keys point at people, nearly all
    -- NO ACTION, so a delete would fail for anyone with any history; is_anonymous
    -- is how this schema has always expressed "a person we keep no details for"
    -- (the donor_identified_or_anonymous check permits a null name only then, and
    -- people_email_key excludes anonymized rows from the unique index).
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'rider_profiles' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
           where p.tenant_id = v_tenant
             and p.auth_user_id is null
             and not p.is_anonymous
             and public.person_last_activity_at(p.id) < p_as_of - v_period
             and not public.retention_person_is_retained(p.id)
        );
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'anonymized', v_person_ids);
        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.people
             set is_anonymous = true,
                 name = null,
                 preferred_name = null,
                 email = null,
                 phone = null,
                 instagram_handle = null,
                 pronouns = null,
                 notes = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
    end;

    -- F. Portal accounts.
    --
    -- auth.users is never touched. audit_log.actor_id references it with no ON
    -- DELETE, as do ~120 other created_by/updated_by columns across the schema, so
    -- deleting an account that ever wrote a row raises 23503 -- and the audit
    -- trail is retained separately for governance, security, audit, insurance and
    -- legal purposes anyway. What this rule does is clear the personal details on
    -- the linked people row and remove any role grant that outlived the
    -- deactivation. /privacy is worded to match (see the same PR).
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'portal_accounts' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
            join public.deactivated_users d on d.user_id = p.auth_user_id
           where p.tenant_id = v_tenant
             and d.deactivated_at < p_as_of - v_period
             and not p.is_anonymous
        );
        perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'anonymized', v_person_ids);
        if v_enforce and array_length(v_person_ids, 1) is not null then
          -- tenant_id, not just the user id. deactivated_users is platform-wide
          -- (20260906010000 keeps it global: one row per auth account), so the
          -- unscoped form deleted that account's roles in every tenant it belonged
          -- to -- the one place the purge wrote outside the tenant it was sweeping.
          delete from public.user_roles
           where tenant_id = v_tenant
             and user_id in (
               select p.auth_user_id from public.people p where p.id = any(v_person_ids)
             );
          update public.people
             set is_anonymous = true,
                 name = null,
                 preferred_name = null,
                 email = null,
                 phone = null,
                 instagram_handle = null,
                 pronouns = null,
                 notes = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'portal_accounts', 'people', 'skipped', sqlerrm);
    end;

    -- G. Unclaimed portal invitations. pending_role_grants holds an email address
    -- and its own header (20260824060000) says there is no cleanup job; this is
    -- that job. Note the residual: the table is audited, so the delete writes the
    -- email into audit_log.old_data, which has no clock of its own. That is a real
    -- if smaller exposure than leaving the live row, and is tracked separately.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'pending_role_grants' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', '{}');
      else
        v_ids := array(
          select g.id
            from public.pending_role_grants g
           where g.tenant_id = v_tenant
             and ((g.status in ('claimed', 'revoked') and g.created_at < p_as_of - v_period)
              or (g.status = 'pending' and g.expires_at < p_as_of - v_period))
        );
        perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.pending_role_grants where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', sqlerrm);
    end;

    -- I. Audit trail snapshots (#720). Redaction, not deletion.
    --
    -- Runs after every rule above on purpose: A, C, E and G have just written
    -- this tenant's old values into audit_log.old_data, and the entries they
    -- wrote tonight are the ones a reader would most expect to find scrubbed
    -- seven years from now. Order does not matter for correctness -- the clock
    -- is the entry's own occurred_at -- but it is the order the rules read in.
    --
    -- Only entries that still hold something are counted or touched: a snapshot
    -- whose registered keys are all jsonb null already is finished, and without
    -- that test it would be rewritten and re-reported every night forever.
    --
    -- Null tenant_id means an audit entry for one of the global tables
    -- (deactivated_users, retention_policies, tenants ...). Those belong to the
    -- platform tenant, which is how 20260906160000 backfilled the historical
    -- ones, so the oldest tenant's run is what sweeps them -- rather than their
    -- being visible to every tenant's admin and swept by none.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'audit_log_snapshots' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'audit_log_snapshots', 'audit_log', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.audit_log a
           where (a.tenant_id = v_tenant
                  or (a.tenant_id is null
                      and v_tenant = (select t.id from public.tenants t
                                       order by t.created_at limit 1)))
             and a.redacted_at is null
             and a.occurred_at < p_as_of - v_period
             and public.retention_snapshot_has_personal_data(a.table_name, a.old_data, a.new_data)
        );
        perform public.retention_log(v_run_id, 'audit_log_snapshots', 'audit_log', 'redacted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.audit_log a
             set old_data = public.retention_redact_snapshot(a.table_name, a.old_data),
                 new_data = public.retention_redact_snapshot(a.table_name, a.new_data),
                 redacted_at = now()
           where a.id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'audit_log_snapshots', 'audit_log', 'skipped', sqlerrm);
    end;

    -- J. Merge snapshots (#720). Same treatment, one clock later in the record's
    -- life: person_merges holds two whole people rows, and the registered people
    -- columns are the same eleven rules D1 and D2 clear on a live person. The
    -- merge itself -- who merged whom, when, and the counts of what moved -- is
    -- untouched, which is what the table exists for.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_merge_snapshots' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_merge_snapshots', 'person_merges', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.person_merges m
           where m.tenant_id = v_tenant
             and m.redacted_at is null
             and m.merged_at < p_as_of - v_period
             and public.retention_snapshot_has_personal_data('people', m.merged_snapshot, m.survivor_before)
        );
        perform public.retention_log(v_run_id, 'person_merge_snapshots', 'person_merges', 'redacted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.person_merges m
             set merged_snapshot = public.retention_redact_snapshot('people', m.merged_snapshot),
                 survivor_before = public.retention_redact_snapshot('people', m.survivor_before),
                 redacted_at = now()
           where m.id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_merge_snapshots', 'person_merges', 'skipped', sqlerrm);
    end;
    update public.retention_runs
       set finished_at = now(),
           status = case when v_failed then 'partial' else 'succeeded' end
     where id = v_run_id;
  end loop;

  -- A single-tenant call answers with its run, which is what the portal needs
  -- to link straight to it. A sweep has no single run to name, and cron ignores
  -- the result.
  return v_result_run_id;
end;
$$;

-- The on-request path reaches the copies too (#720).
--
-- #720 asks whether a deletion request reaches the audit log. It does, and it
-- does so now rather than seven years from now: someone who asks us to delete
-- their profile is owed "yes, everywhere", and leaving two copies to expire on a
-- clock the board has not even approved yet would make that answer false.
--
-- Not gated on the policy mode, and deliberately so. The scheduled rules above
-- are proposals waiting on a board decision; honouring a request is a commitment
-- the published privacy policy already makes ("until you ask us to delete your
-- profile"), and the live clear below has never been mode-gated either.
--
-- It also goes further than the live clear, which only drops the rider columns.
-- A snapshot is not a live record: person_merges holds a whole copy of this
-- person, taken because two rows turned out to be the same human, and the point
-- of the request is that we stop holding their details. So the merge snapshots
-- lose every registered people column, and audit entries whose snapshot carries
-- this person's id lose the personal values registered for their own table.
--
-- The audit_log scan is per-row and unindexable -- an id can appear under any
-- key of any snapshot -- but it is bounded by the tenant and by the entries that
-- still hold personal data at all, and this runs once when a person asks, not
-- nightly. Body is otherwise 20260906170000's.
create or replace function public.delete_rider_profile(
  p_person_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_tenant uuid;
  v_merge_ids uuid[];
  v_audit_ids uuid[];
begin
  if not (public.has_permission('events', 'manage')
          or public.has_permission('people', 'manage')) then
    raise exception 'Not authorized';
  end if;

  v_tenant := public.current_tenant_id();

  if not exists (
    select 1 from public.people where id = p_person_id and tenant_id = v_tenant
  ) then
    raise exception 'No such person';
  end if;

  update public.event_registrations r
     set riding_discipline_at_event = p.riding_discipline,
         ski_experience_level_at_event = p.ski_experience_level,
         snowboard_experience_level_at_event = p.snowboard_experience_level
    from public.people p
   where p.id = r.person_id
     and p.id = p_person_id
     and r.checked_in_at is not null
     and r.riding_discipline_at_event is null
     and p.riding_discipline is not null;

  update public.people
     set riding_discipline = null,
         ski_experience_level = null,
         snowboard_experience_level = null,
         preferred_mountain = null
   where id = p_person_id;

  -- Either role: a merge means the two rows were the same person, so a snapshot
  -- of the record that was merged away is a copy of the person asking.
  v_merge_ids := array(
    select m.id
      from public.person_merges m
     where m.tenant_id = v_tenant
       and (m.survivor_person_id = p_person_id or m.merged_person_id = p_person_id)
       and m.redacted_at is null
       and public.retention_snapshot_has_personal_data('people', m.merged_snapshot, m.survivor_before)
  );

  if array_length(v_merge_ids, 1) is not null then
    update public.person_merges m
       set merged_snapshot = public.retention_redact_snapshot('people', m.merged_snapshot),
           survivor_before = public.retention_redact_snapshot('people', m.survivor_before),
           redacted_at = now()
     where m.id = any(v_merge_ids);
  end if;

  v_audit_ids := array(
    select a.id
      from public.audit_log a
     where a.tenant_id = v_tenant
       and a.redacted_at is null
       and public.retention_snapshot_has_personal_data(a.table_name, a.old_data, a.new_data)
       and exists (
         select 1
           from (values (a.old_data), (a.new_data)) as s(data)
           cross join lateral jsonb_each_text(coalesce(s.data, '{}'::jsonb)) e
          where e.value = p_person_id::text
       )
  );

  if array_length(v_audit_ids, 1) is not null then
    update public.audit_log a
       set old_data = public.retention_redact_snapshot(a.table_name, a.old_data),
           new_data = public.retention_redact_snapshot(a.table_name, a.new_data),
           redacted_at = now()
     where a.id = any(v_audit_ids);
  end if;

  insert into public.retention_runs
    (tenant_id, as_of, dry_run, trigger, triggered_by, reason, status, finished_at)
  values (v_tenant, now(), false, 'request', auth.uid(), p_reason, 'succeeded', now())
  returning id into v_run_id;

  perform public.retention_log(
    v_run_id, 'rider_profiles', 'people', 'cleared',
    array[p_person_id], p_person_id
  );
  perform public.retention_log(
    v_run_id, 'person_merge_snapshots', 'person_merges', 'redacted',
    v_merge_ids, p_person_id
  );
  perform public.retention_log(
    v_run_id, 'audit_log_snapshots', 'audit_log', 'redacted',
    v_audit_ids, p_person_id
  );
end;
$$;
