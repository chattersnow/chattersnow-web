-- #1577 (part 2 of #1575): the event Impact card gains "people served", and
-- the giveaway's hand-typed sales figures are retired.
--
-- 1. get_event_impact_derived_data gains a `distributions` key: the event's
--    `distributed` inventory movements with their recipient and the item's
--    face value. computePeopleServed (src/lib/portal/impact-metrics.ts) turns
--    them into units given out, distinct recipients and value given out --
--    the one definition the Report card's Goods section
--    (get_event_report_data, 20261011140000) also uses. Both bodies are
--    otherwise 20260923160000's.
--
-- 2. get_program_impact_rollup_data's `distributed_movements` rows carry the
--    same three fields, so the Program Impact Report adds people served
--    through the same function.
--
-- 3. The remaining typed event_impact_notes fields were re-checked against
--    what the system now records. None has a system source, so all stay:
--      first_time_riders        first time on snow ever. Rider profiles hold
--                               beginner / intermediate / advanced, with no
--                               "never ridden"; first-time *participants* is
--                               a different, already-derived figure.
--      rental_subsidies_count   no rental or subsidy record exists; discount
--                               codes are counted separately.
--      assistance_total         dollars of help given; discount codes carry
--                               no amount, and nothing else records it.
--      beginner_pairings_count  no pairing or mentor record exists.
--      notes                    free text.
--
-- 4. giveaways.tickets_sold, ticket_price and revenue_amount are retired. The
--    portal reads ticket sales and revenue from giveaway_ticket_sales, and
--    packages carry their own prices. The columns are kept, not dropped, so
--    their values stay archived where they are: some may sit in filed reports,
--    and seed_demo_tenant (20260908080000) still writes them. The giveaway card
--    shows a non-zero hand-entered figure read-only, beside the computed ones.

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
    'discount_codes', case when v_can_view_impact then coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id,
        'registration_id', registration_id
      ))
      from public.discount_codes
      where event_id = v_event_id and registration_id is not null
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
        'attendance_count', attendance_count
      ))
      from public.events
      where id = any(v_event_ids)
    ), '[]'::jsonb),
    'impact_notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', event_id,
        'rental_subsidies_count', rental_subsidies_count,
        'assistance_total', assistance_total
      ))
      from public.event_impact_notes
      where event_id = any(v_event_ids)
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
        'event_id', event_id,
        'registration_id', registration_id
      ))
      from public.discount_codes
      where event_id = any(v_event_ids) and registration_id is not null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

comment on column public.giveaways.tickets_sold is
  'Retired by #1577: hand-entered, superseded by giveaway_ticket_sales. Kept as an archive and shown read-only; the portal no longer writes it.';
comment on column public.giveaways.ticket_price is
  'Retired by #1577: superseded by giveaway_ticket_packages.price. Kept as an archive; the portal no longer writes it.';
comment on column public.giveaways.revenue_amount is
  'Retired by #1577: hand-entered, superseded by the sum of giveaway_ticket_sales.amount. Kept as an archive and shown read-only; the portal no longer writes it.';
