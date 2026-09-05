-- Issue #602, part 4 of 6: the purge.
--
-- Applies each period in retention_policies. Two properties matter more than
-- anything else here:
--
--   1. Nothing is destroyed unless BOTH p_dry_run is false AND that individual
--      policy's mode is 'enforce'. Every policy ships in 'dry_run'
--      (20260905090000), so the job runs nightly from the day it lands and
--      changes nothing until a human turns a rule on. `development` and `main`
--      share one Supabase project holding real donor data, so "merged" must not
--      mean "enforcing".
--   2. Wherever the aggregate still matters, personal columns are cleared and
--      the row is kept. Event attendance, first-time-rider counts and discipline
--      splits feed impact and grant reporting; deleting three-year-old
--      registrations would silently restate figures already filed with funders.
--      The published page already describes this ("we delete it, or we strip the
--      personal details and keep only the count").
--
-- ORDER IS LOAD-BEARING. The rules run: rate limits, contact messages, event
-- registrations, volunteer applications, gear movements, rider clear, person
-- anonymization, portal accounts, invitations. Anonymizing a person asks "is
-- anything still pointing at this row?", so it has to run *after* the rules that
-- drop those references -- unlinking the gear movement and deleting the expired
-- application is precisely what makes the person eligible. Moving the person
-- rule earlier would not fail; it would quietly stop anonymizing gear
-- requesters and expired applicants, and nothing would report that.

-- Sweeps the abuse-protection table. Separate from run_retention_purge because
-- it is scheduled hourly rather than nightly (the table is high-churn), it is
-- not gated by mode -- a sliding-window counter has no dry-run story and an IP
-- has no operational value past its window -- and it must not queue behind the
-- nightly job's advisory lock.
--
-- Ungranted, like check_rate_limit() itself (20260826170000): rate_limit_hits
-- has no policies and no grants, and nobody reaches it but the owner.
create function public.purge_rate_limit_hits(p_as_of timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period interval;
  v_deleted integer;
begin
  select period into v_period
    from public.retention_policies where policy_key = 'rate_limit_hits';
  if v_period is null then
    return 0;
  end if;

  delete from public.rate_limit_hits where created_at < p_as_of - v_period;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- The existing index leads on `route` (20260826170000), so an age-only sweep
-- would seq-scan the whole table.
create index rate_limit_hits_created_at_idx on public.rate_limit_hits (created_at);

-- One log line per rule per run. Caps sample_ids at 20 -- enough for a reviewer
-- to go and look at what a dry run proposes, few enough that the log stays a
-- log.
create function public.retention_log(
  p_run_id uuid,
  p_policy_key text,
  p_table_name text,
  p_action text,
  p_ids uuid[],
  p_subject_person_id uuid default null
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.retention_run_tables
    (run_id, policy_key, table_name, action, row_count, sample_ids, subject_person_id)
  values (
    p_run_id, p_policy_key, p_table_name, p_action,
    coalesce(array_length(p_ids, 1), 0),
    coalesce(p_ids[1:20], '{}'),
    p_subject_person_id
  );
$$;

-- Is anything still pointing at this person that the purge is not allowed to
-- drop?
--
-- Walks every single-column foreign key referencing public.people -- the same
-- pg_constraint discovery merge_people() uses (20260904180000), and for the same
-- reason it gives there: there are 40+ such columns across 30+ tables and the
-- schema gains more most weeks, so a hand-maintained list would be stale within
-- the month. Anything not named in retention_purgeable_person_refs counts as a
-- reason to keep the person.
--
-- That is what implements the policy's exemptions without enumerating them: a
-- donor (donations, monetary_donations, giveaway_prizes), sponsor, board member,
-- staff member, payee, governance participant, asset owner, event lead or
-- somebody's primary contact is retained because a row still references them.
-- Donation and financial records are exempt from the published periods, and this
-- is the mechanism that honours that.
create function public.retention_person_is_retained(p_person_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ref record;
  v_referenced boolean;
begin
  for v_ref in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.confrelid = 'public.people'::regclass
       and array_length(c.conkey, 1) = 1
  loop
    if exists (
      select 1 from public.retention_purgeable_person_refs r
       where r.table_name = v_ref.tbl and r.column_name = v_ref.col
    ) then
      continue;
    end if;

    execute format(
      'select exists (select 1 from %s t where t.%I = $1)', v_ref.tbl, v_ref.col
    ) into v_referenced using p_person_id;

    if v_referenced then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

-- The purge. Ungranted -- the check_rate_limit()/generate_volunteer_reference_code()
-- template. pg_cron runs jobs as `postgres`, which owns this function, so the
-- scheduled call needs no grant and no service-role key anywhere.
--
-- p_as_of is not a convenience. people.updated_at and
-- volunteer_applications.updated_at are maintained by set_updated_at triggers,
-- so no client can backdate them -- injecting the clock is the only way those
-- two rules are testable at all. It is deliberately not exposed through the
-- granted wrapper below: an admin-settable "as of" would be a one-click time
-- machine over the delete path.
create function public.run_retention_purge(
  p_dry_run boolean default true,
  p_as_of timestamptz default now(),
  p_trigger text default 'cron'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
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

  insert into public.retention_runs (as_of, dry_run, trigger, triggered_by, status)
  values (p_as_of, p_dry_run, p_trigger, auth.uid(), 'running')
  returning id into v_run_id;

  -- Each rule gets its own exception block. A plpgsql exception block is a
  -- subtransaction, so a rule that fails rolls back only itself and the run
  -- finishes as 'partial' with the error recorded against that rule -- rather
  -- than one bad clock discarding the work of the other eight.

  -- H. Abuse-protection records. Not mode-gated; see purge_rate_limit_hits.
  begin
    if not p_dry_run then
      perform public.purge_rate_limit_hits(p_as_of);
    end if;
    perform public.retention_log(v_run_id, 'rate_limit_hits', 'rate_limit_hits',
      case when p_dry_run then 'skipped' else 'deleted' end, '{}');
  exception when others then
    v_failed := true;
    insert into public.retention_run_tables (run_id, policy_key, table_name, action, error)
    values (v_run_id, 'rate_limit_hits', 'rate_limit_hits', 'skipped', sqlerrm);
  end;

  -- A. Contact form messages. The one table here that is safe to delete
  -- outright: nothing has a foreign key to it and it carries no audit trigger.
  begin
    select period, mode into v_period, v_mode
      from public.retention_policies where policy_key = 'contact_messages';
    v_enforce := not p_dry_run and v_mode = 'enforce';

    if v_mode = 'off' then
      perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'skipped', '{}');
    else
      v_ids := array(
        select id from public.contact_messages where created_at < p_as_of - v_period
      );
      perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'deleted', v_ids);
      if v_enforce and array_length(v_ids, 1) is not null then
        delete from public.contact_messages where id = any(v_ids);
      end if;
    end if;
  exception when others then
    v_failed := true;
    insert into public.retention_run_tables (run_id, policy_key, table_name, action, error)
    values (v_run_id, 'contact_messages', 'contact_messages', 'skipped', sqlerrm);
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
      from public.retention_policies where policy_key = 'event_registrations';
    v_enforce := not p_dry_run and v_mode = 'enforce';

    if v_mode = 'off' then
      perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'skipped', '{}');
    else
      v_ids := array(
        select r.id
          from public.event_registrations r
          join public.events e on e.id = r.event_id
         where coalesce(e.ends_at, e.starts_at) < p_as_of - v_period
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
    insert into public.retention_run_tables (run_id, policy_key, table_name, action, error)
    values (v_run_id, 'event_registrations', 'event_registrations', 'skipped', sqlerrm);
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
      from public.retention_policies where policy_key = 'volunteer_applications';
    v_enforce := not p_dry_run and v_mode = 'enforce';

    if v_mode = 'off' then
      perform public.retention_log(v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', '{}');
    else
      v_ids := array(
        select a.id
          from public.volunteer_applications a
         where case
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
    insert into public.retention_run_tables (run_id, policy_key, table_name, action, error)
    values (v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', sqlerrm);
  end;

  -- E. Gear requests. The movement row is inventory history and stays; only the
  -- link to the requester goes. The requester's name, email and phone are not
  -- on the movement at all -- request_gear_items() puts them on a people row via
  -- resolve_or_create_person_by_email() -- so unlinking here is what lets the
  -- person rule below reach them.
  begin
    select period, mode into v_period, v_mode
      from public.retention_policies where policy_key = 'gear_requests';
    v_enforce := not p_dry_run and v_mode = 'enforce';

    if v_mode = 'off' then
      perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'skipped', '{}');
    else
      v_ids := array(
        select m.id
          from public.inventory_movements m
         where m.recipient_person_id is not null
           and m.movement_type in ('reserved', 'distributed')
           and m.occurred_at < p_as_of - v_period
      );
      perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'anonymized', v_ids);
      if v_enforce and array_length(v_ids, 1) is not null then
        update public.inventory_movements set recipient_person_id = null
         where id = any(v_ids);
      end if;
    end if;
  exception when others then
    v_failed := true;
    insert into public.retention_run_tables (run_id, policy_key, table_name, action, error)
    values (v_run_id, 'gear_requests', 'inventory_movements', 'skipped', sqlerrm);
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
      from public.retention_policies where policy_key = 'rider_profiles';
    v_enforce := not p_dry_run and v_mode = 'enforce';

    if v_mode = 'off' then
      perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
    else
      v_person_ids := array(
        select p.id
          from public.people p
         where p.riding_discipline is not null
           and public.person_last_activity_at(p.id) < p_as_of - v_period
      );

      v_ids := array(
        select r.id
          from public.event_registrations r
          join public.people p on p.id = r.person_id
         where r.checked_in_at is not null
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
    insert into public.retention_run_tables (run_id, policy_key, table_name, action, error)
    values (v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
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
      from public.retention_policies where policy_key = 'rider_profiles';
    v_enforce := not p_dry_run and v_mode = 'enforce';

    if v_mode = 'off' then
      perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
    else
      v_person_ids := array(
        select p.id
          from public.people p
         where p.auth_user_id is null
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
    insert into public.retention_run_tables (run_id, policy_key, table_name, action, error)
    values (v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
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
      from public.retention_policies where policy_key = 'portal_accounts';
    v_enforce := not p_dry_run and v_mode = 'enforce';

    if v_mode = 'off' then
      perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'skipped', '{}');
    else
      v_person_ids := array(
        select p.id
          from public.people p
          join public.deactivated_users d on d.user_id = p.auth_user_id
         where d.deactivated_at < p_as_of - v_period
           and not p.is_anonymous
      );
      perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'anonymized', v_person_ids);
      if v_enforce and array_length(v_person_ids, 1) is not null then
        delete from public.user_roles
         where user_id in (
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
    insert into public.retention_run_tables (run_id, policy_key, table_name, action, error)
    values (v_run_id, 'portal_accounts', 'people', 'skipped', sqlerrm);
  end;

  -- G. Unclaimed portal invitations. pending_role_grants holds an email address
  -- and its own header (20260824060000) says there is no cleanup job; this is
  -- that job. Note the residual: the table is audited, so the delete writes the
  -- email into audit_log.old_data, which has no clock of its own. That is a real
  -- if smaller exposure than leaving the live row, and is tracked separately.
  begin
    select period, mode into v_period, v_mode
      from public.retention_policies where policy_key = 'pending_role_grants';
    v_enforce := not p_dry_run and v_mode = 'enforce';

    if v_mode = 'off' then
      perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', '{}');
    else
      v_ids := array(
        select g.id
          from public.pending_role_grants g
         where (g.status in ('claimed', 'revoked') and g.created_at < p_as_of - v_period)
            or (g.status = 'pending' and g.expires_at < p_as_of - v_period)
      );
      perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'deleted', v_ids);
      if v_enforce and array_length(v_ids, 1) is not null then
        delete from public.pending_role_grants where id = any(v_ids);
      end if;
    end if;
  exception when others then
    v_failed := true;
    insert into public.retention_run_tables (run_id, policy_key, table_name, action, error)
    values (v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', sqlerrm);
  end;

  update public.retention_runs
     set finished_at = now(),
         status = case when v_failed then 'partial' else 'succeeded' end
   where id = v_run_id;

  return v_run_id;
end;
$$;

-- What the portal calls. Authorization is re-checked here rather than trusted
-- from the server action, matching merge_people(). p_as_of is deliberately not
-- a parameter.
create function public.trigger_retention_run(p_dry_run boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('administration', 'manage') then
    raise exception 'Not authorized';
  end if;

  return public.run_retention_purge(
    p_dry_run => p_dry_run, p_as_of => now(), p_trigger => 'manual'
  );
end;
$$;

grant execute on function public.trigger_retention_run to authenticated;
