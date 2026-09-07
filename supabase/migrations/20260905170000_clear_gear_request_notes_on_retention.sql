-- Issue #721: gear request notes now live on inventory_movements.notes
-- (20260905160000) instead of people.notes, so the gear_requests rule has to
-- clear them on the same 3-year clock it already uses to unlink the requester.
-- That was the point of moving them: on people.notes the text was shielded
-- indefinitely by any person the purge is required to keep -- a donor, a board
-- member, a volunteer with logged hours.
--
-- Body from 20260905120000, with two lines changed inside rule E. Signature is
-- unchanged, so create-or-replace keeps the pg_cron jobs (20260905140000) and
-- trigger_retention_run() pointed at it without rescheduling.

create or replace function public.run_retention_purge(
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
  -- requester goes -- the link, and now the free text they wrote on the request
  -- form, which #721 moved off people.notes and onto the movement. Their name,
  -- email and phone are still not on the movement -- request_gear_items() puts
  -- those on a people row via resolve_or_create_person_by_email() -- so
  -- unlinking here is what lets the person rule below reach them.
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
        update public.inventory_movements set recipient_person_id = null, notes = null
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

-- The published description promised less than the rule now does.
update public.retention_policies
   set description = 'Measured from the most recent handover. The inventory movement survives as inventory history; the link to the requester and anything they wrote on the request form are removed.'
 where policy_key = 'gear_requests';
