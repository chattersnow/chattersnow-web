-- #1651: registrants see their carpool assignment -- on /my, on the answers
-- link page, and by email.
--
-- Once staff have built the cars (#1649), each person in one needs to know
-- which car, who drives and who they ride with, so they can arrange pickup
-- and the cost split (#1650) themselves.
--
-- WHAT A REGISTRANT SEES. One shape, built once by carpool_assignment_card():
-- the car's label and leaving-from, their role, the driver and the other
-- riders -- each a first name (the first word of the registration's name), an
-- Instagram handle or `has_no_instagram`, and a party size. Never a phone
-- number, an email, the preferred contact detail, the car's staff notes or
-- anyone's paid status. Someone without Instagram is reached through staff or
-- the group chat. That car-mates see a first name and a handle is what the
-- cost-split notice tells every registrant before they join a car (#1650):
-- notice, not consent, as with photos (#1376).
--
-- 1. `event_carpool_assignment_emails`: when each person was last emailed
--    their assignment, and a signature of what they were sent, so "only those
--    whose car changed" is a comparison rather than a guess. One row per
--    registration, drivers and passengers alike, in a table of its own rather
--    than on the cars: cars are audited, and a stamp per send would fill the
--    event's history with rows nobody made by hand.
-- 2. carpool_assignment_card(), internal.
-- 3. The two registrant reads: my_registration_carpool() for /my, resolved
--    through the caller's linked person, and registration_carpool_by_token()
--    for the answers link, through #1502's resolver and so with its
--    LINK_INVALID. Both return null where the event organizes no carpools,
--    and otherwise {"car": <card or null>} -- null being "not in a car yet".
-- 4. The staff read behind "Email carpool assignments", at events: manage.
-- 5. The answers link: issued on a carpool event even when it asks no
--    questions (#1647 left this for carpools), and issued by the assignment
--    email under a source of its own.

-- ---------------------------------------------------------------------------
-- 1. When each person was last emailed
-- ---------------------------------------------------------------------------

create table public.event_carpool_assignment_emails (
  registration_id uuid primary key,
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null,
  emailed_at timestamptz not null default now(),
  -- md5 of the registration id and the card it was sent; see section 4.
  signature text not null
    constraint event_carpool_assignment_emails_signature_check
      check (signature ~ '^[0-9a-f]{32}$'),
  constraint event_carpool_assignment_emails_registration_fkey
    foreign key (tenant_id, registration_id)
    references public.event_registrations (tenant_id, id) on delete cascade,
  constraint event_carpool_assignment_emails_event_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade
);

comment on table public.event_carpool_assignment_emails is
  'When each person in a carpool car was last emailed their assignment (#1651), and an md5 of what they were sent, so staff can email only those whose car changed. No grants: read through event_carpool_assignment_recipients(), written by the sender on the service role.';

create index event_carpool_assignment_emails_event_idx
  on public.event_carpool_assignment_emails (event_id);

alter table public.event_carpool_assignment_emails enable row level security;
revoke all on public.event_carpool_assignment_emails from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The card
-- ---------------------------------------------------------------------------

-- What one person in a car is shown about it, or null when the registration is
-- in no car or is cancelled. Does not look at the event's switch: the callers
-- do, so each can tell "carpools off" from "not in a car yet".
create function public.carpool_assignment_card(p_registration_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select r.id, r.tenant_id, r.event_id, r.party_size,
           coalesce(driven.id, ridden.car_id) as car_id,
           case when driven.id is not null then 'driver' else 'passenger' end as role
      from public.event_registrations r
      left join public.event_carpool_cars driven
        on driven.driver_registration_id = r.id and driven.tenant_id = r.tenant_id
      left join public.event_carpool_passengers ridden
        on ridden.registration_id = r.id and ridden.tenant_id = r.tenant_id
     where r.id = p_registration_id
       and r.cancelled_at is null
  ),
  mates as (
    select r.id,
           jsonb_build_object(
             'first_name', nullif(split_part(btrim(r.name), ' ', 1), ''),
             'instagram_handle', nullif(btrim(coalesce(r.instagram_handle, '')), ''),
             'has_no_instagram', coalesce(r.has_no_instagram, false),
             'party_size', coalesce(r.party_size, 1)
           ) as mate
      from public.event_registrations r
      join me on r.tenant_id = me.tenant_id and r.event_id = me.event_id
     where r.cancelled_at is null
  )
  select jsonb_build_object(
           'car_label', c.label,
           'leaving_from', c.leaving_from,
           'role', me.role,
           'party_size', coalesce(me.party_size, 1),
           'driver', (
             select m.mate from mates m
              where m.id = c.driver_registration_id and m.id <> me.id
           ),
           'riders', coalesce((
             select jsonb_agg(m.mate order by p.added_at, p.registration_id)
               from public.event_carpool_passengers p
               join mates m on m.id = p.registration_id
              where p.car_id = c.id
                and p.tenant_id = c.tenant_id
                and p.registration_id <> me.id
           ), '[]'::jsonb)
         )
    from me
    join public.event_carpool_cars c on c.id = me.car_id and c.tenant_id = me.tenant_id;
$$;

comment on function public.carpool_assignment_card(uuid) is
  'Internal (#1651): what a person in a carpool car is shown -- car label, leaving from, their role and party size, the driver and other riders as first name, Instagram handle or has_no_instagram, and party size. Never a phone, email, preferred contact detail, staff note or paid status. Null when the registration is in no car or is cancelled.';

revoke execute on function public.carpool_assignment_card(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The registrant's reads
-- ---------------------------------------------------------------------------

-- /my/registration/[id]. my_registration_contact()'s person resolution, so
-- somebody else's id returns null.
create function public.my_registration_carpool(p_registration_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when e.carpools_enabled then
           jsonb_build_object('car', public.carpool_assignment_card(r.id))
         end
    from public.event_registrations r
    join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
   where r.id = p_registration_id
     and r.cancelled_at is null
     and r.person_id = public.my_constituent_person_id('events');
$$;

comment on function public.my_registration_carpool(uuid) is
  'The signed-in caller''s own carpool assignment (#1651): null where the registration is not theirs, is cancelled, or its event organizes no carpools; otherwise {"car": carpool_assignment_card() or null when not placed yet}.';

revoke execute on function public.my_registration_carpool(uuid) from public, anon;
grant execute on function public.my_registration_carpool(uuid) to authenticated;

-- The answers link page. Callable by anon, since most registrants have no
-- account and the token is the permission. Rate-limited in its own bucket,
-- like get_registration_answer_request(), which the same page also calls.
create function public.registration_carpool_by_token(
  p_token_hash text,
  p_ip_address inet
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_result jsonb;
begin
  if not public.check_rate_limit('registration_carpool_by_token', p_ip_address, 30, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  -- LINK_INVALID for anything unknown, expired, superseded, cancelled or
  -- another tenant's.
  select * into v_request
    from public.resolve_registration_answer_request(p_token_hash, false);

  select case when e.carpools_enabled then
           jsonb_build_object('car', public.carpool_assignment_card(v_request.registration_id))
         end
    into v_result
    from public.events e
   where e.id = v_request.event_id
     and e.tenant_id = v_request.tenant_id;

  return v_result;
end;
$$;

comment on function public.registration_carpool_by_token(text, inet) is
  'The carpool assignment behind a live answers link (#1651), for registrants with no account: null where the event organizes no carpools, otherwise {"car": carpool_assignment_card() or null}. LINK_INVALID as get_registration_answer_request(); rate-limited per IP.';

revoke execute on function public.registration_carpool_by_token(text, inet) from public;
grant execute on function public.registration_carpool_by_token(text, inet) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Who "Email carpool assignments" reaches
-- ---------------------------------------------------------------------------

-- Everyone in a car on the event, drivers first, with the card they would be
-- sent and whether it differs from the one they were last sent. The signature
-- covers the registration id as well as the card, so a new driver handed an
-- unchanged car still counts as changed. jsonb's text form is canonical, so
-- the same card always hashes the same.
create function public.event_carpool_assignment_recipients(p_event_id uuid)
returns table (
  registration_id uuid,
  name text,
  email text,
  person_id uuid,
  card jsonb,
  signature text,
  emailed_at timestamptz,
  changed boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- events: manage, this tenant's event, and carpools on.
  perform public.carpool_event_guard(p_event_id);

  return query
    with people as (
      select c.driver_registration_id as id, 0 as role_order, c.sort_order, c.created_at, null::timestamptz as added_at
        from public.event_carpool_cars c
       where c.event_id = p_event_id
         and c.driver_registration_id is not null
      union all
      select p.registration_id, 1, c.sort_order, c.created_at, p.added_at
        from public.event_carpool_passengers p
        join public.event_carpool_cars c on c.id = p.car_id and c.tenant_id = p.tenant_id
       where p.event_id = p_event_id
    ),
    cards as (
      select r.id, r.name, r.email, r.person_id,
             public.carpool_assignment_card(r.id) as card,
             people.sort_order, people.created_at, people.role_order, people.added_at
        from people
        join public.event_registrations r
          on r.id = people.id and r.tenant_id = public.current_tenant_id()
       where r.cancelled_at is null
    )
    select cards.id, cards.name, cards.email, cards.person_id, cards.card,
           md5(cards.id::text || cards.card::text),
           sent.emailed_at,
           sent.signature is distinct from md5(cards.id::text || cards.card::text)
      from cards
      left join public.event_carpool_assignment_emails sent
        on sent.registration_id = cards.id
     where cards.card is not null
     order by cards.sort_order, cards.created_at, cards.role_order, cards.added_at nulls first;
end;
$$;

comment on function public.event_carpool_assignment_recipients(uuid) is
  'Everyone in a car on the event (#1651), at events: manage: name, email, person, the card carpool_assignment_card() builds for them, its signature, when they were last emailed one and whether it changed since. Refuses an event with carpools off (CARPOOLS_DISABLED).';

revoke execute on function public.event_carpool_assignment_recipients(uuid) from public, anon;
grant execute on function public.event_carpool_assignment_recipients(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The answers link
-- ---------------------------------------------------------------------------

alter table public.event_registration_answer_requests
  drop constraint event_registration_answer_requests_source_check,
  add constraint event_registration_answer_requests_source_check
    check (source in ('staff', 'confirmation', 'already_registered', 'carpool_assignment'));

-- 20261021180000's body with the condition widened once more -- an event that
-- organizes carpools, whose link page shows the carpool card even with no
-- questions -- and one more source: the assignment email's fresh link, which
-- replaces the confirmation's (#1591: the newest email always works).
CREATE OR REPLACE FUNCTION public.issue_registration_answer_link(p_registration_id uuid, p_token_hash text, p_source text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_registration record;
  v_expires_at timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ANSWER_REQUESTS_INVALID';
  end if;
  if p_source is null or p_source not in ('confirmation', 'already_registered', 'carpool_assignment') then
    raise exception 'ANSWER_REQUESTS_INVALID';
  end if;

  select reg.id, reg.tenant_id, e.starts_at, e.ends_at
    into v_registration
    from public.event_registrations reg
    join public.events e on e.id = reg.event_id and e.tenant_id = reg.tenant_id
   where reg.id = p_registration_id
     and reg.cancelled_at is null
     and (exists (
            select 1
              from public.event_registration_questions q
             where q.event_id = e.id
               and q.tenant_id = e.tenant_id
               and q.archived_at is null
          )
          -- #1647
          or public.tenant_requires_instagram(reg.tenant_id)
          -- #1651
          or e.carpools_enabled);

  if not found then
    return null;
  end if;

  v_expires_at := coalesce(v_registration.ends_at, v_registration.starts_at + interval '1 day');
  if v_expires_at <= now() then
    return null;
  end if;

  insert into public.event_registration_answer_requests as a
    (tenant_id, registration_id, token_hash, expires_at, requested_at, requested_by, source)
  values
    (v_registration.tenant_id, v_registration.id, p_token_hash, v_expires_at, now(), null, p_source)
  on conflict on constraint event_registration_answer_requests_registration_key
  do update set
    token_hash = excluded.token_hash,
    expires_at = excluded.expires_at,
    requested_at = excluded.requested_at,
    requested_by = null,
    source = excluded.source;

  return v_expires_at;
end;
$function$;

comment on function public.issue_registration_answer_link(uuid, text, text) is
  'Hands a registrant their own answers link (#1591): from the confirmation (''confirmation''), a second registration attempt (''already_registered'') or the carpool assignment email (''carpool_assignment'', #1651). Service role only, because the caller supplies the token hash. Supersedes any earlier link for the registration. Returns the expiry, or null where nothing was issued: no such active registration, nothing on the page (no current questions, no Instagram requirement -- #1647 -- and no carpools -- #1651), or the event has ended.';
