-- Registrants changing their own answers (#1591)
-- ---------------------------------------------------------------------------
--
-- #1502's answers link existed only when staff sent one, so a registrant whose
-- carpool plans changed had no way to say so but to register again under a
-- second address -- two active registrations for one person, an inflated
-- headcount and answers that disagree. This hands the same link to the
-- registrant without anyone asking:
--
--   * in the confirmation email and on the success screen, minted when the
--     registration is taken (and again whenever staff resend the confirmation);
--   * by email, when somebody tries to register again with an address that is
--     already registered -- mailed to that address only, never shown.
--
-- THE LINK IS UNCHANGED. Same table, same capability page, same validator
-- (submit_registration_answers_by_token -> apply_registration_answers with
-- p_required), same expiry. Still ONE ROW PER REGISTRATION: issuing a link
-- supersedes the previous one, whoever issued either. The newest email always
-- works; an older one lands on the "no longer works" page, which tells the
-- reader to use the most recent email from the organization. That was chosen
-- over several live links per registration as the simpler of the two (#1591).
--
-- `source` says who issued the current link, so the registrants tab's
-- "Asked {date}" and the bulk send's "asked in the last day" guard count only
-- staff asks, not links the registrant was handed automatically.
--
-- `event_registrations.answers_changed_at` records when the registrant last
-- changed their own answers after registering, by either self-service path --
-- the link or /my -- so staff who planned carpools off the first answers can
-- see that they moved. Staff edits and the registration itself leave it alone.
-- A date is not personal data, and the column joins no retention rule.
--
-- set_my_registration_answers stops refusing after the registration deadline
-- (and on an event whose registration was since switched off). Changing an
-- answer takes no place, and the link has never refused either; the two paths
-- now stop at the same moment, the event's end.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

alter table public.event_registration_answer_requests
  add column source text not null default 'staff'
    constraint event_registration_answer_requests_source_check
      check (source in ('staff', 'confirmation', 'already_registered'));

comment on column public.event_registration_answer_requests.source is
  'Who issued the current link (#1591): staff asking from the portal (''staff''), the registration confirmation and its resends (''confirmation''), or a second registration attempt with an address already registered (''already_registered''). Only ''staff'' reads as "Asked" in the portal.';

grant select (source) on public.event_registration_answer_requests to authenticated;

alter table public.event_registrations
  add column answers_changed_at timestamptz;

comment on column public.event_registrations.answers_changed_at is
  'When the registrant last changed their own registration answers after registering, through an answers link or /my (#1591). Null where they never have. Not set by staff edits or by registering. Set only by submit_registration_answers_by_token() and set_my_registration_answers().';

-- event_registrations is read through column grants (20260922040000).
grant select (answers_changed_at) on public.event_registrations to authenticated;

-- Staff asks keep the default; request_registration_answers() names it anyway,
-- so a staff ask after a self-issued link reads as an ask again.
create or replace function public.request_registration_answers(
  p_event_id uuid,
  p_requests jsonb
)
returns table (registration_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_event record;
  v_expires_at timestamptz;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to message registrants';
  end if;

  select e.starts_at, e.ends_at
    into v_event
    from public.events e
   where e.id = p_event_id
     and e.tenant_id = v_tenant_id;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  v_expires_at := coalesce(v_event.ends_at, v_event.starts_at + interval '1 day');
  if v_expires_at <= now() then
    raise exception 'EVENT_ENDED';
  end if;

  if p_requests is null
     or jsonb_typeof(p_requests) <> 'array'
     or exists (
       select 1
         from jsonb_array_elements(p_requests) r
        where jsonb_typeof(r) <> 'object'
           or coalesce(r->>'registration_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or coalesce(r->>'token_hash', '') !~ '^[0-9a-f]{64}$'
     ) then
    raise exception 'ANSWER_REQUESTS_INVALID';
  end if;

  return query
    insert into public.event_registration_answer_requests as a
      (tenant_id, registration_id, token_hash, expires_at, requested_at, requested_by, source)
    select distinct on (reg.id)
           v_tenant_id, reg.id, r->>'token_hash', v_expires_at, now(), auth.uid(), 'staff'
      from jsonb_array_elements(p_requests) r
      join public.event_registrations reg
        on reg.id = (r->>'registration_id')::uuid
       and reg.tenant_id = v_tenant_id
       and reg.event_id = p_event_id
       and reg.cancelled_at is null
    on conflict on constraint event_registration_answer_requests_registration_key
    do update set
      token_hash = excluded.token_hash,
      expires_at = excluded.expires_at,
      requested_at = excluded.requested_at,
      requested_by = excluded.requested_by,
      source = excluded.source
    returning a.registration_id, a.expires_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Issuing a link to the registrant
-- ---------------------------------------------------------------------------

-- The one write both self-service routes make. Service role only: the caller
-- supplies the hash, and anyone who could call this with a hash of their own
-- choosing would hold a working link to the registration. The Server Actions
-- mint the token, so the hash is never the caller's to pick.
--
-- Issues nothing -- returns null -- for a registration that does not exist
-- (a filled honeypot's made-up id), is cancelled, belongs to an event with no
-- current questions, or whose event has ended.
create function public.issue_registration_answer_link(
  p_registration_id uuid,
  p_token_hash text,
  p_source text
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration record;
  v_expires_at timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ANSWER_REQUESTS_INVALID';
  end if;
  if p_source is null or p_source not in ('confirmation', 'already_registered') then
    raise exception 'ANSWER_REQUESTS_INVALID';
  end if;

  select reg.id, reg.tenant_id, e.starts_at, e.ends_at
    into v_registration
    from public.event_registrations reg
    join public.events e on e.id = reg.event_id and e.tenant_id = reg.tenant_id
   where reg.id = p_registration_id
     and reg.cancelled_at is null
     and exists (
       select 1
         from public.event_registration_questions q
        where q.event_id = e.id
          and q.tenant_id = e.tenant_id
          and q.archived_at is null
     );

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
$$;

comment on function public.issue_registration_answer_link(uuid, text, text) is
  'Hands a registrant their own answers link (#1591): from the confirmation (''confirmation'') or a second registration attempt (''already_registered''). Service role only, because the caller supplies the token hash. Supersedes any earlier link for the registration. Returns the expiry, or null where nothing was issued: no such active registration, no current questions, or the event has ended.';

revoke execute on function public.issue_registration_answer_link(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.issue_registration_answer_link(uuid, text, text) to service_role;

-- Somebody registering again with an address already registered. Looks the
-- registration up by (tenant, event, address) and issues it a link, returning
-- what the mail needs -- the registration's own address, so the link goes
-- there and nowhere else. Service role only, for the reason above; the tenant
-- is the public site's, resolved by the action from the request host.
--
-- Rate-limited per (route, ip) like the public routes, separately from
-- register_for_event: the attempt that got here already spent one of those,
-- and a link mailed on demand to any address someone can type is worth a
-- tighter cap.
create function public.issue_registration_answer_link_for_email(
  p_tenant_id uuid,
  p_event_id uuid,
  p_email text,
  p_token_hash text,
  p_ip_address inet
)
returns table (
  registration_id uuid,
  name text,
  email text,
  person_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration record;
  v_expires_at timestamptz;
begin
  if not public.check_rate_limit('issue_registration_answer_link_for_email', p_ip_address, 5, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  select reg.id, reg.name, reg.email, reg.person_id
    into v_registration
    from public.event_registrations reg
   where reg.tenant_id = p_tenant_id
     and reg.event_id = p_event_id
     and reg.cancelled_at is null
     and reg.email <> ''
     and lower(reg.email) = lower(btrim(coalesce(p_email, '')));

  if not found then
    return;
  end if;

  v_expires_at := public.issue_registration_answer_link(
    v_registration.id, p_token_hash, 'already_registered'
  );
  if v_expires_at is null then
    return;
  end if;

  return query select v_registration.id, v_registration.name, v_registration.email,
                      v_registration.person_id, v_expires_at;
end;
$$;

comment on function public.issue_registration_answer_link_for_email(uuid, uuid, text, text, inet) is
  'A second registration attempt with an address already registered for the event (#1591): issues that registration an answers link (see issue_registration_answer_link) and returns {registration_id, name, email, person_id, expires_at} for the mail, or no row where nothing was issued. Service role only. Rate-limited per IP; raises RATE_LIMITED.';

revoke execute on function public.issue_registration_answer_link_for_email(uuid, uuid, text, text, inet)
  from public, anon, authenticated;
grant execute on function public.issue_registration_answer_link_for_email(uuid, uuid, text, text, inet)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Recording a registrant's own change
-- ---------------------------------------------------------------------------

-- 20261001200000's body, plus the answers_changed_at stamp.
create or replace function public.submit_registration_answers_by_token(
  p_token_hash text,
  p_answers jsonb,
  p_ip_address inet
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
begin
  if not public.check_rate_limit('submit_registration_answers_by_token', p_ip_address, 10, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  -- for update: a second save racing this one waits rather than interleaving
  -- its delete-and-insert of the answers with ours.
  select * into v_request
    from public.resolve_registration_answer_request(p_token_hash, true);

  perform public.apply_registration_answers(
    v_request.tenant_id, v_request.event_id, v_request.registration_id, p_answers, true
  );

  update public.event_registration_answer_requests
     set answered_at = now()
   where id = v_request.request_id;

  update public.event_registrations
     set answers_changed_at = now()
   where id = v_request.registration_id
     and tenant_id = v_request.tenant_id;
end;
$$;

-- 20261001100000's body without the registration_enabled and deadline checks,
-- which become "until the event ends" to match the link, plus the stamp.
create or replace function public.set_my_registration_answers(
  p_registration_id uuid,
  p_answers jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid := public.my_constituent_person_id('events');
  v_registration record;
begin
  if v_person_id is null then
    raise exception 'NO_RECORD';
  end if;

  select r.tenant_id, r.event_id, r.cancelled_at, e.starts_at, e.ends_at
    into v_registration
    from public.event_registrations r
    join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
   where r.id = p_registration_id
     and r.person_id = v_person_id;

  if not found then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  if v_registration.cancelled_at is not null then
    raise exception 'REGISTRATION_CANCELLED';
  end if;

  if coalesce(v_registration.ends_at, v_registration.starts_at + interval '1 day') <= now() then
    raise exception 'EVENT_ENDED';
  end if;

  perform public.apply_registration_answers(
    v_registration.tenant_id, v_registration.event_id, p_registration_id, p_answers, true
  );

  update public.event_registrations
     set answers_changed_at = now()
   where id = p_registration_id
     and tenant_id = v_registration.tenant_id;
end;
$$;

comment on function public.set_my_registration_answers(uuid, jsonb) is
  'Changes the signed-in caller''s own answers to an event''s registration questions (#1501), for an active registration of theirs, until the event ends (#1591; it closed with registration before). Held to the same rules as registering, required questions included. Stamps event_registrations.answers_changed_at. Raises EVENT_ENDED once the event is over.';

-- `editable` follows set_my_registration_answers(): until the event ends.
create or replace function public.my_registration_questions(p_registration_id uuid)
returns table (
  question_id uuid,
  kind text,
  prompt text,
  help text,
  required boolean,
  options jsonb,
  min_value integer,
  max_value integer,
  show_if jsonb,
  value jsonb,
  answer_text text,
  editable boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    q.id,
    q.kind,
    q.prompt,
    q.help,
    q.required,
    q.options,
    q.min_value,
    q.max_value,
    q.show_if,
    mine.value,
    mine.answer_text,
    r.cancelled_at is null
      and coalesce(e.ends_at, e.starts_at + interval '1 day') > now()
  from public.event_registrations r
  join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
  join public.event_registration_questions q
    on q.event_id = e.id and q.tenant_id = e.tenant_id and q.archived_at is null
  left join public.event_registration_answers mine
    on mine.registration_id = r.id and mine.question_id = q.id
  where r.id = p_registration_id
    and r.person_id = public.my_constituent_person_id('events')
  order by q.sort_order, q.created_at;
$$;

comment on function public.my_registration_questions(uuid) is
  'The signed-in caller''s own answers to an event''s registration questions (#1501): each current question with their answer, and whether they can still change it -- until the event ends (#1591). No rows for a registration that is not theirs or an event with no questions.';
