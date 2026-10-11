-- #1588: the event Report and Impact cards merge into one Results card, and
-- the last four typed impact figures are derived or dropped. Report figures
-- are never typed: a number comes from records captured where the work
-- happens, and only free text is written at report time.
--
-- 1. A `first_time` rider level, below beginner, on the rider profile
--    (#1408) and its check-in snapshot. The four functions that validate a
--    level are redefined with it; their bodies are otherwise unchanged.
--    "First time on snow" is the checked-in attendees whose level is
--    first_time, read like beginner_attendees (20260904140000). It replaces
--    the typed first_time_riders.
--
-- 2. discount_codes gains an optional `kind` (rental, lift, lesson, other)
--    and `value`. Rental subsidies are rental-kind codes held by a registrant
--    who did not cancel; this replaces the typed rental_subsidies_count.
--
-- 3. event_expenses gains `participant_assistance`. No expense category
--    existed to reuse, so it is a flag. Participant assistance is the value
--    of assigned codes, plus the value given out in distributions, plus paid
--    expenses carrying the flag; each part is shown on its own line. This
--    replaces the typed assistance_total.
--
--    On an event that auto-assigns a code to every registrant, an assigned
--    code is not evidence of subsidy, so it counts toward neither figure.
--    That rule is applied in src/lib/portal/impact-metrics.ts.
--
-- 4. beginner_pairings_count is dropped from the portal: no pairing record
--    exists.
--
-- 5. All four typed columns are archived, not dropped. The portal stops
--    writing them and shows a non-null value read-only as "Entered by hand
--    (archived)". get_program_impact_rollup_data no longer reads them, so an
--    archived figure is never added to a derived one.
--
-- get_event_impact_derived_data and get_program_impact_rollup_data are
-- otherwise 20261011170000's.

-- 1. first_time rider level ---------------------------------------------------

alter table public.people
  drop constraint people_ski_experience_level_check,
  add constraint people_ski_experience_level_check
    check (ski_experience_level in ('first_time', 'beginner', 'intermediate', 'advanced')),
  drop constraint people_snowboard_experience_level_check,
  add constraint people_snowboard_experience_level_check
    check (snowboard_experience_level in ('first_time', 'beginner', 'intermediate', 'advanced'));

alter table public.event_registrations
  drop constraint event_registrations_ski_experience_level_at_event_check,
  add constraint event_registrations_ski_experience_level_at_event_check
    check (ski_experience_level_at_event in ('first_time', 'beginner', 'intermediate', 'advanced')),
  drop constraint event_registrations_snowboard_experience_level_at_event_check,
  add constraint event_registrations_snowboard_experience_level_at_event_check
    check (snowboard_experience_level_at_event in ('first_time', 'beginner', 'intermediate', 'advanced'));

CREATE OR REPLACE FUNCTION public.apply_registration_rider_profile(p_tenant_id uuid, p_person_id uuid, p_riding_discipline text, p_ski_experience_level text, p_snowboard_experience_level text, p_preferred_mountain text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_riding_discipline is null then
    return;
  end if;

  if not public.module_enabled_for_tenant(p_tenant_id, 'rider_profile') then
    return;
  end if;

  if p_riding_discipline not in ('ski', 'snowboard', 'both') then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  if p_riding_discipline in ('ski', 'both')
    and (p_ski_experience_level is null
      or p_ski_experience_level not in ('first_time', 'beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  if p_riding_discipline in ('snowboard', 'both')
    and (p_snowboard_experience_level is null
      or p_snowboard_experience_level not in ('first_time', 'beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  update public.people
  set riding_discipline = p_riding_discipline,
      ski_experience_level = case
        when p_riding_discipline in ('ski', 'both') then p_ski_experience_level
      end,
      snowboard_experience_level = case
        when p_riding_discipline in ('snowboard', 'both') then p_snowboard_experience_level
      end,
      preferred_mountain = nullif(btrim(coalesce(p_preferred_mountain, '')), '')
  where id = p_person_id
    and tenant_id = p_tenant_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.save_registrant_rider_profile(p_registration_id uuid, p_riding_discipline text, p_ski_experience_level text DEFAULT NULL::text, p_snowboard_experience_level text DEFAULT NULL::text, p_preferred_mountain text DEFAULT NULL::text, p_honeypot text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_person_id uuid;
  v_tenant_id uuid := public.public_tenant_id();
begin
  if not public.check_rate_limit('save_registrant_rider_profile', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return;
  end if;

  -- #902
  if not public.module_enabled_for_tenant(v_tenant_id, 'events') then
    raise exception 'RIDER_PROFILE_UNAVAILABLE';
  end if;

  -- #1408
  if not public.module_enabled_for_tenant(v_tenant_id, 'rider_profile') then
    raise exception 'SECTION_UNAVAILABLE';
  end if;

  if p_riding_discipline is null or p_riding_discipline not in ('ski', 'snowboard', 'both') then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  if p_riding_discipline in ('ski', 'both')
    and (p_ski_experience_level is null
      or p_ski_experience_level not in ('first_time', 'beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  if p_riding_discipline in ('snowboard', 'both')
    and (p_snowboard_experience_level is null
      or p_snowboard_experience_level not in ('first_time', 'beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  select person_id into v_person_id
  from public.event_registrations
  where id = p_registration_id
    and tenant_id = v_tenant_id
    and person_id is not null
    and created_at > now() - interval '1 day';

  if v_person_id is null then
    raise exception 'RIDER_PROFILE_UNAVAILABLE';
  end if;

  update public.people
  set riding_discipline = p_riding_discipline,
      ski_experience_level = case
        when p_riding_discipline in ('ski', 'both') then p_ski_experience_level
      end,
      snowboard_experience_level = case
        when p_riding_discipline in ('snowboard', 'both') then p_snowboard_experience_level
      end,
      preferred_mountain = nullif(btrim(coalesce(p_preferred_mountain, '')), '')
  where id = v_person_id
    and tenant_id = v_tenant_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.set_registrant_rider_profile(p_registration_id uuid, p_riding_discipline text, p_ski_experience_level text DEFAULT NULL::text, p_snowboard_experience_level text DEFAULT NULL::text, p_preferred_mountain text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_person_id uuid;
  v_checked_in timestamptz;
  v_ski text;
  v_snowboard text;
begin
  if not public.has_permission('events', 'manage')
     or not public.has_permission('rider_profiles', 'manage') then
    raise exception 'Not authorized to edit registrant rider profiles';
  end if;

  if p_riding_discipline not in ('ski', 'snowboard', 'both') then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  v_ski := case when p_riding_discipline in ('ski', 'both') then p_ski_experience_level end;
  v_snowboard := case when p_riding_discipline in ('snowboard', 'both') then p_snowboard_experience_level end;

  if p_riding_discipline in ('ski', 'both')
     and (v_ski is null or v_ski not in ('first_time', 'beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;
  if p_riding_discipline in ('snowboard', 'both')
     and (v_snowboard is null or v_snowboard not in ('first_time', 'beginner', 'intermediate', 'advanced')) then
    raise exception 'INVALID_RIDER_PROFILE';
  end if;

  select person_id, checked_in_at into v_person_id, v_checked_in
  from public.event_registrations
  where id = p_registration_id
    and tenant_id = (select public.current_tenant_id());

  if v_person_id is null then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  update public.people
  set riding_discipline = p_riding_discipline,
      ski_experience_level = v_ski,
      snowboard_experience_level = v_snowboard,
      preferred_mountain = nullif(btrim(coalesce(p_preferred_mountain, '')), '')
  where id = v_person_id;

  if v_checked_in is not null then
    update public.event_registrations
    set riding_discipline_at_event = p_riding_discipline,
        ski_experience_level_at_event = v_ski,
        snowboard_experience_level_at_event = v_snowboard
    where id = p_registration_id;
  end if;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.set_my_contact_details(p_preferred_name text, p_phone text, p_pronouns text, p_instagram_handle text, p_preferred_mountain text, p_riding_discipline text, p_ski_experience_level text, p_snowboard_experience_level text, p_address_line1 text, p_address_line2 text, p_address_city text, p_address_region text, p_address_postal_code text, p_address_country text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_person_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_rider boolean := public.public_module_enabled('rider_profile');
  v_discipline text := nullif(btrim(p_riding_discipline), '');
  v_ski text := nullif(btrim(p_ski_experience_level), '');
  v_snowboard text := nullif(btrim(p_snowboard_experience_level), '');
  v_handle text := nullif(btrim(ltrim(btrim(p_instagram_handle), '@')), '');
begin
  v_person_id := public.my_contact_person_id();
  if v_person_id is null then
    raise exception 'No record to edit';
  end if;

  if v_rider then
    if v_discipline is not null and v_discipline not in ('ski', 'snowboard', 'both') then
      raise exception 'That is not a riding discipline';
    end if;
    if v_discipline is null or v_discipline not in ('ski', 'both') then
      v_ski := null;
    end if;
    if v_discipline is null or v_discipline not in ('snowboard', 'both') then
      v_snowboard := null;
    end if;
    if v_ski is not null and v_ski not in ('first_time', 'beginner', 'intermediate', 'advanced') then
      raise exception 'That is not an experience level';
    end if;
    if v_snowboard is not null and v_snowboard not in ('first_time', 'beginner', 'intermediate', 'advanced') then
      raise exception 'That is not an experience level';
    end if;
  end if;
  if v_handle is not null and v_handle !~ '^[A-Za-z0-9._]{1,30}$' then
    raise exception 'An Instagram handle is letters, numbers, periods and underscores';
  end if;

  select public.person_self_edit_snapshot(p) into v_before
    from public.people p where p.id = v_person_id;

  update public.people set
    preferred_name = nullif(btrim(p_preferred_name), ''),
    phone = nullif(btrim(p_phone), ''),
    pronouns = nullif(btrim(p_pronouns), ''),
    instagram_handle = v_handle,
    preferred_mountain = case
      when v_rider then nullif(btrim(p_preferred_mountain), '')
      else preferred_mountain
    end,
    riding_discipline = case when v_rider then v_discipline else riding_discipline end,
    ski_experience_level = case when v_rider then v_ski else ski_experience_level end,
    snowboard_experience_level = case
      when v_rider then v_snowboard
      else snowboard_experience_level
    end,
    address_line1 = nullif(btrim(p_address_line1), ''),
    address_line2 = nullif(btrim(p_address_line2), ''),
    address_city = nullif(btrim(p_address_city), ''),
    address_region = nullif(btrim(p_address_region), ''),
    address_postal_code = nullif(btrim(p_address_postal_code), ''),
    address_country = nullif(btrim(p_address_country), ''),
    updated_at = now(),
    updated_by = (select auth.uid())
  where id = v_person_id;

  select public.person_self_edit_snapshot(p) into v_after
    from public.people p where p.id = v_person_id;

  perform public.log_person_self_edit(v_person_id, v_before, v_after);
end;
$function$

;

-- 2. Discount code kind and value ---------------------------------------------

alter table public.discount_codes
  add column kind text
    check (kind in ('rental', 'lift', 'lesson', 'other')),
  add column value numeric(10, 2)
    check (value >= 0);

comment on column public.discount_codes.kind is
  'What the code pays for (#1588). Rental-kind codes held by a registrant who did not cancel are the event''s rental subsidies.';
comment on column public.discount_codes.value is
  'What the code is worth to the registrant (#1588). Assigned codes'' values count toward participant assistance.';

-- 3. Participant-assistance expenses ------------------------------------------

alter table public.event_expenses
  add column participant_assistance boolean not null default false;

comment on column public.event_expenses.participant_assistance is
  'Money spent directly on participants -- a rental paid for, a lift ticket bought (#1588). Paid expenses with this flag count toward the event''s participant assistance.';

-- 5. Archive the typed impact figures -----------------------------------------

comment on column public.event_impact_notes.first_time_riders is
  'Archived by #1588: hand-entered. Superseded by checked-in attendees whose rider level is first_time. Shown read-only where set; the portal no longer writes it.';
comment on column public.event_impact_notes.rental_subsidies_count is
  'Archived by #1588: hand-entered. Superseded by rental-kind discount codes held by a registrant. Shown read-only where set; the portal no longer writes it.';
comment on column public.event_impact_notes.assistance_total is
  'Archived by #1588: hand-entered. Superseded by assigned code values, distribution value and participant-assistance expenses. Shown read-only where set; the portal no longer writes it.';
comment on column public.event_impact_notes.beginner_pairings_count is
  'Archived by #1588: hand-entered, and dropped from the portal since no pairing record exists. Shown read-only where set; the portal no longer writes it.';

-- RPCs ------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_event_impact_derived_data(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_can_view_impact boolean;
  v_result jsonb;
  v_event_id uuid;
begin
  v_can_view_impact := public.has_permission('event_impact', 'view');

  if not (v_can_view_impact or public.has_permission('events', 'view')) then
    raise exception 'Not authorized to view event impact figures';
  end if;

  select id into v_event_id
    from public.events
   where id = p_event_id
     and tenant_id = (select public.current_tenant_id());

  select jsonb_build_object(
    'event_id', p_event_id,
    'auto_assign_discount_codes', coalesce((
      select auto_assign_discount_codes from public.events where id = v_event_id
    ), false),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', id,
        'attendance_count', attendance_count
      ))
      from public.events
      where id = v_event_id
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'event_id', event_id,
        'checked_in_at', checked_in_at
      ))
      from public.event_registrations
      where event_id = v_event_id
        -- #1418
        and cancelled_at is null
    ), '[]'::jsonb),
    'checkin_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'checked_in_event_count', checked_in_event_count
      ))
      from (
        select person_id, count(*) as checked_in_event_count
        from public.event_registrations
        where checked_in_at is not null
          and person_id = any(
            select distinct person_id
            from public.event_registrations
            where event_id = v_event_id
              and checked_in_at is not null
              and person_id is not null
          )
        group by person_id
      ) per_person
    ), '[]'::jsonb),
    'event_volunteers', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from public.event_volunteers
      where event_id = v_event_id and person_id is not null
    ), '[]'::jsonb),
    'volunteer_hour_people', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct event_id, person_id
        from public.volunteer_hours
        where event_id = v_event_id
      ) vh
    ), '[]'::jsonb),
    -- #1577: people served. Every caller of this function may see it; the
    -- recipient ids only ever leave as a count.
    'distributions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', mov.event_id,
        'quantity', mov.quantity,
        'recipient_person_id', mov.recipient_person_id,
        'inventory_item_id', mov.inventory_item_id,
        'face_value', items.face_value
      ))
      from public.inventory_movements mov
      join public.inventory_items items on items.id = mov.inventory_item_id
      where mov.event_id = v_event_id
        and mov.movement_type = 'distributed'
    ), '[]'::jsonb),
    -- #1588: kind and value, and only codes held by a registrant who did not
    -- cancel -- a cancelled registrant's code helped nobody.
    'discount_codes', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', dc.event_id,
        'registration_id', dc.registration_id,
        'kind', dc.kind,
        'value', dc.value
      ))
      from public.discount_codes dc
      join public.event_registrations reg on reg.id = dc.registration_id
      where dc.event_id = v_event_id and reg.cancelled_at is null
    ), '[]'::jsonb) else null::jsonb end,
    -- #1588: paid expenses tagged as participant assistance. Amounts only.
    'assistance_expenses', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', exps.event_id,
        'amount', exps.amount
      ))
      from public.event_expenses exps
      where exps.event_id = v_event_id
        and exps.participant_assistance
        and exps.status = 'paid'
    ), '[]'::jsonb) else null::jsonb end,
    -- #1588: checked-in attendees whose level was first time on snow, read
    -- the way beginner_attendees is.
    'first_time_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = v_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level = 'first_time' or lvl.snowboard_level = 'first_time')
      ) first_timers
    ), '[]'::jsonb) else null::jsonb end,
    'beginner_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = v_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level = 'beginner' or lvl.snowboard_level = 'beginner')
      ) beginners
    ), '[]'::jsonb) else null::jsonb end,
    'profiled_attendees', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = v_event_id
          and r.checked_in_at is not null
          and (lvl.ski_level is not null or lvl.snowboard_level is not null)
      ) profiled
    ), '[]'::jsonb) else null::jsonb end
  ) into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_program_impact_rollup_data(p_program_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event_ids uuid[];
  v_result jsonb;
begin
  if not public.has_permission('programs_reports', 'view') then
    raise exception 'Not authorized to view program impact reports';
  end if;

  select coalesce(array_agg(event_id), '{}') into v_event_ids
  from public.event_programs
  where program_id = p_program_id
    and tenant_id = (select public.current_tenant_id());

  select jsonb_build_object(
    'event_ids', to_jsonb(v_event_ids),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', id,
        'attendance_count', attendance_count,
        'auto_assign_discount_codes', auto_assign_discount_codes
      ))
      from public.events
      where id = any(v_event_ids)
    ), '[]'::jsonb),
    -- #1588: impact_notes is gone. Its typed figures are archived, and adding
    -- them to the derived ones would count the same help twice.
    'assistance_expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', exps.event_id,
        'amount', exps.amount
      ))
      from public.event_expenses exps
      where exps.event_id = any(v_event_ids)
        and exps.participant_assistance
        and exps.status = 'paid'
    ), '[]'::jsonb),
    'first_time_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level = 'first_time' or lvl.snowboard_level = 'first_time')
      ) first_timers
    ), '[]'::jsonb),
    'distributed_movements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'quantity', mov.quantity,
        'event_id', mov.event_id,
        'recipient_person_id', mov.recipient_person_id,
        'inventory_item_id', mov.inventory_item_id,
        'face_value', items.face_value
      ))
      from public.inventory_movements mov
      join public.inventory_items items on items.id = mov.inventory_item_id
      where mov.event_id = any(v_event_ids) and mov.movement_type = 'distributed'
    ), '[]'::jsonb),
    'volunteer_hours', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'hours', hours))
      from public.volunteer_hours
      where event_id = any(v_event_ids)
    ), '[]'::jsonb),
    'event_volunteers', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from public.event_volunteers
      where event_id = any(v_event_ids) and person_id is not null
    ), '[]'::jsonb),
    'volunteer_hour_people', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct event_id, person_id
        from public.volunteer_hours
        where event_id = any(v_event_ids)
      ) vh
    ), '[]'::jsonb),
    'beginner_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level = 'beginner' or lvl.snowboard_level = 'beginner')
      ) beginners
    ), '[]'::jsonb),
    'profiled_attendees', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', event_id, 'person_id', person_id))
      from (
        select distinct r.event_id, r.person_id
        from public.event_registrations r
        join public.people p on p.id = r.person_id
        cross join lateral (
          select case when r.riding_discipline_at_event is not null
                      then r.ski_experience_level_at_event
                      else p.ski_experience_level end as ski_level,
                 case when r.riding_discipline_at_event is not null
                      then r.snowboard_experience_level_at_event
                      else p.snowboard_experience_level end as snowboard_level
        ) lvl
        where r.event_id = any(v_event_ids)
          and r.checked_in_at is not null
          and (lvl.ski_level is not null or lvl.snowboard_level is not null)
      ) profiled
    ), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'event_id', event_id,
        'checked_in_at', checked_in_at
      ))
      from public.event_registrations
      where event_id = any(v_event_ids)
        -- #1418
        and cancelled_at is null
    ), '[]'::jsonb),
    'checkin_counts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', person_id,
        'checked_in_event_count', checked_in_event_count
      ))
      from (
        select person_id, count(*) as checked_in_event_count
        from public.event_registrations
        where checked_in_at is not null
          and person_id = any(
            select distinct person_id
            from public.event_registrations
            where event_id = any(v_event_ids)
              and checked_in_at is not null
              and person_id is not null
          )
        group by person_id
      ) per_person
    ), '[]'::jsonb),
    'discount_codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', dc.event_id,
        'registration_id', dc.registration_id,
        'kind', dc.kind,
        'value', dc.value
      ))
      from public.discount_codes dc
      join public.event_registrations reg on reg.id = dc.registration_id
      where dc.event_id = any(v_event_ids) and reg.cancelled_at is null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;
