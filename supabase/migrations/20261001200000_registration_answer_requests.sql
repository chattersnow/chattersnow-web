-- Asking registrants for missing answers by emailed link (#1502)
-- ---------------------------------------------------------------------------
--
-- Questions added to an event that is already taking registrations (#1501)
-- leave everybody who registered before them with nothing answered. Most of
-- those registrants are anonymous -- no account, no claimed record -- so
-- /my/registration/[id] does not reach them, and asking them to make an
-- account and wait for a claim review to answer three carpool questions would
-- lose most of them.
--
-- So staff email each one a link, and THE LINK IS A SINGLE-PURPOSE CAPABILITY,
-- NOT A SIGN-IN. It opens one public page showing the event's name, the
-- registrant's first name and that event's questions -- no email, phone or
-- party details, so a forwarded link leaks almost nothing -- and it can save
-- answers to that one registration and nothing else.
--
-- THE RAW TOKEN NEVER REACHES THE DATABASE, as with #1049's confirmation
-- tokens (20260914030000). The Server Action mints 32 random bytes, mails them,
-- and passes only their SHA-256 here; following the link hashes what it
-- presented and matches on that. The hash is not readable either: it is the
-- one column left out of the select grant below, because the public functions
-- take a hash, which makes the hash itself as good as the link.
--
-- ONE ROW PER REGISTRATION. Asking again overwrites the hash, which is what
-- supersedes the earlier link: it simply stops matching.
--
-- EXPIRY IS THE EVENT'S END, or its start plus a day where it has no end. It
-- is independent of the registration deadline, because answering takes no
-- place. A cancelled registration's link stops working at once.
--
-- UNKNOWN, EXPIRED, SUPERSEDED, CANCELLED AND OTHER-TENANT LINKS ARE ONE
-- REFUSAL, `LINK_INVALID`, so a caller cannot tell them apart.
--
-- RETENTION. Nothing here is personal data: dates, a staff member's id, and
-- the hash of a token that stopped working when its event ended. The table is
-- not audited and has no column the snapshot guard
-- (retention_unregistered_personal_columns, 20260907150000) would flag, and a
-- row goes with its registration if that is ever deleted. Rule C anonymizing
-- the registration three years on leaves a row that names nobody.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

create table public.event_registration_answer_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  registration_id uuid not null,
  -- SHA-256 of the token in the email, hex. Never the token itself.
  token_hash text not null
    constraint event_registration_answer_requests_token_hash_check
      check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  requested_at timestamptz not null default now(),
  -- Set null rather than blocking an account's removal: the row's job is the
  -- link and the "Asked" status, and neither needs to know who any more.
  requested_by uuid references auth.users(id) on delete set null,
  -- The last time answers were saved through a link. Survives a later
  -- request, so "Answered" and "Asked" are read off the two dates together.
  answered_at timestamptz,
  constraint event_registration_answer_requests_registration_key
    unique (tenant_id, registration_id),
  constraint event_registration_answer_requests_token_hash_key
    unique (token_hash),
  constraint event_registration_answer_requests_registration_fkey
    foreign key (tenant_id, registration_id)
    references public.event_registrations (tenant_id, id) on delete cascade
);

comment on table public.event_registration_answer_requests is
  'The emailed link that lets a registrant fill in an event''s registration questions without an account (#1502). One row per registration; asking again overwrites token_hash, which supersedes the earlier link. token_hash is the SHA-256 of the token in the email -- the token itself is never stored -- and is withheld from the select grant, because the public functions accept a hash. Written only by request_registration_answers() and submit_registration_answers_by_token().';

alter table public.event_registration_answer_requests enable row level security;

-- The revoke first, because a hosted project's default privileges hand every
-- new table to both roles (20260911010000, section 4). Everything but the hash.
revoke all on public.event_registration_answer_requests from public, anon, authenticated;
grant select (id, tenant_id, registration_id, expires_at, requested_at, requested_by, answered_at)
  on public.event_registration_answer_requests to authenticated;

-- Read under the same permission as the registrants they describe: the
-- registrants tab shows "Asked" and "Answered" to whoever can read the list.
create policy "event_registration_answer_requests select"
  on public.event_registration_answer_requests
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

-- ---------------------------------------------------------------------------
-- 2. Asking
-- ---------------------------------------------------------------------------

-- Staff, from the registrants tab and the registrant detail sheet. p_requests
-- is [{"registration_id": uuid, "token_hash": hex}, ...]: the action mints one
-- token per registration it means to mail and hands over only the hashes.
--
-- A registration that is not this event's, is cancelled or does not exist is
-- skipped rather than refused, so one registration cancelled while the dialog
-- was open does not sink the batch. The rows returned are the ones written --
-- the only ones the action may mail.
create function public.request_registration_answers(
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
      (tenant_id, registration_id, token_hash, expires_at, requested_at, requested_by)
    select distinct on (reg.id)
           v_tenant_id, reg.id, r->>'token_hash', v_expires_at, now(), auth.uid()
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
      requested_by = excluded.requested_by
    returning a.registration_id, a.expires_at;
end;
$$;

comment on function public.request_registration_answers(uuid, jsonb) is
  'Staff asking registrants to complete an event''s registration questions by emailed link (#1502). Requires events: manage. Takes [{registration_id, token_hash}], the hashes of tokens the caller minted; writes one link per active registration of this event, superseding any earlier one, and returns the rows written. Raises EVENT_NOT_FOUND, EVENT_ENDED (the link would already have expired) or ANSWER_REQUESTS_INVALID.';

revoke execute on function public.request_registration_answers(uuid, jsonb) from public, anon;
grant execute on function public.request_registration_answers(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Following the link
-- ---------------------------------------------------------------------------

-- The one lookup both public functions make. A link works only while it is the
-- current one for its registration, has not expired, the registration is
-- still active, and the request reached this tenant's public site. Anything
-- else is LINK_INVALID, whichever of those it was.
create function public.resolve_registration_answer_request(
  p_token_hash text,
  p_for_update boolean
)
returns table (
  request_id uuid,
  tenant_id uuid,
  registration_id uuid,
  event_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'LINK_INVALID';
  end if;

  if p_for_update then
    return query
      select a.id, a.tenant_id, a.registration_id, reg.event_id
        from public.event_registration_answer_requests a
        join public.event_registrations reg
          on reg.id = a.registration_id and reg.tenant_id = a.tenant_id
       where a.token_hash = p_token_hash
         and a.expires_at > now()
         and reg.cancelled_at is null
         and a.tenant_id = public.public_tenant_id()
       for update of a;
  else
    return query
      select a.id, a.tenant_id, a.registration_id, reg.event_id
        from public.event_registration_answer_requests a
        join public.event_registrations reg
          on reg.id = a.registration_id and reg.tenant_id = a.tenant_id
       where a.token_hash = p_token_hash
         and a.expires_at > now()
         and reg.cancelled_at is null
         and a.tenant_id = public.public_tenant_id();
  end if;

  if not found then
    raise exception 'LINK_INVALID';
  end if;
end;
$$;

comment on function public.resolve_registration_answer_request(text, boolean) is
  'Internal to the two public answer-link functions (#1502): the live request a token hash names on this tenant''s public site, or LINK_INVALID. Never called by a client.';

revoke execute on function public.resolve_registration_answer_request(text, boolean)
  from public, anon, authenticated;

-- What the link's page shows: the event, the registrant's first name, and the
-- event's current questions with whatever has been answered already. Nothing
-- else about the registration -- not the email, the phone or the party -- so a
-- forwarded link gives away almost nothing.
--
-- Callable by anon, because the people this exists for have no account.
-- Rate-limited per (route, ip) like get_artwork_call(): the token is 256 bits
-- and cannot be guessed, but the limiter is what stops somebody trying.
create function public.get_registration_answer_request(
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
  if not public.check_rate_limit('get_registration_answer_request', p_ip_address, 30, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  select * into v_request
    from public.resolve_registration_answer_request(p_token_hash, false);

  select jsonb_build_object(
           'event_id', e.id,
           'event_name', e.name,
           'first_name', nullif(split_part(btrim(reg.name), ' ', 1), ''),
           'expires_at', a.expires_at,
           'questions', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'question_id', q.id,
                      'kind', q.kind,
                      'prompt', q.prompt,
                      'help', q.help,
                      'required', q.required,
                      'options', q.options,
                      'min_value', q.min_value,
                      'max_value', q.max_value,
                      'show_if', q.show_if,
                      'value', ans.value,
                      'answer_text', ans.answer_text
                    ) order by q.sort_order, q.created_at)
               from public.event_registration_questions q
               left join public.event_registration_answers ans
                 on ans.registration_id = reg.id and ans.question_id = q.id
              where q.event_id = e.id
                and q.tenant_id = e.tenant_id
                and q.archived_at is null
           ), '[]'::jsonb)
         )
    into v_result
    from public.event_registration_answer_requests a
    join public.event_registrations reg
      on reg.id = a.registration_id and reg.tenant_id = a.tenant_id
    join public.events e
      on e.id = reg.event_id and e.tenant_id = reg.tenant_id
   where a.id = v_request.request_id;

  return v_result;
end;
$$;

comment on function public.get_registration_answer_request(text, inet) is
  'The public page behind an emailed answers link (#1502): {event_id, event_name, first_name, expires_at, questions: [{question_id, kind, prompt, help, required, options, min_value, max_value, show_if, value, answer_text}]}. No contact or party details. Raises LINK_INVALID for an unknown, expired, superseded, cancelled or other-tenant link alike. Rate-limited per IP.';

revoke execute on function public.get_registration_answer_request(text, inet) from public;
grant execute on function public.get_registration_answer_request(text, inet) to anon, authenticated;

-- Saving through the link. The same validation as registering, required
-- questions included (apply_registration_answers with p_required), and the
-- link keeps working until it expires, so a mistake can be corrected.
create function public.submit_registration_answers_by_token(
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
end;
$$;

comment on function public.submit_registration_answers_by_token(text, jsonb, inet) is
  'Saves a registration''s answers through an emailed link (#1502), held to the same rules as registering, required questions included. Usable until the link expires. Raises LINK_INVALID (see get_registration_answer_request), EVENT_ANSWERS_INVALID or EVENT_ANSWERS_REQUIRED. Rate-limited per IP.';

revoke execute on function public.submit_registration_answers_by_token(text, jsonb, inet) from public;
grant execute on function public.submit_registration_answers_by_token(text, jsonb, inet) to anon, authenticated;
