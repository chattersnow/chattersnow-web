-- #879: a call for artwork stands on its own.
--
-- Since #870 a call has been welded to an event: `event_id` not null, the
-- public page's heading, date and location all read off the joined row, and
-- the portal's create dialog will not open a call without one. Plenty of calls
-- have no event behind them -- a zine issue, an ongoing submissions inbox, a
-- call that opens long before the event it might feed is scheduled.
--
-- The blocker was never the foreign key. It was that a call had no identity of
-- its own: every string the public page displayed came off the event, so an
-- eventless call had literally nothing to render as a heading (the portal fell
-- back to the string "Untitled event"). So the first change here is a title.

-- Identity ---------------------------------------------------------------------

alter table public.event_artwork_calls
  add column title text,
  -- No event means no zone to render a deadline in, and events are the only
  -- thing in this schema that carries one. Null keeps inheriting the event's,
  -- which is what an attached call should do; a standalone call sets its own.
  add column timezone text;

-- Backfilled from the event, which is exactly what these calls were being
-- titled with already.
update public.event_artwork_calls c
   set title = e.name
  from public.events e
 where e.id = c.event_id
   and e.tenant_id = c.tenant_id;

-- Belt and braces for a row whose event vanished between the add and the
-- update; there is no such row today and this leaves nothing nullable behind.
update public.event_artwork_calls
   set title = 'Call for artwork'
 where title is null;

alter table public.event_artwork_calls
  alter column title set not null,
  add constraint event_artwork_calls_title_not_blank check (btrim(title) <> '');

comment on column public.event_artwork_calls.title is
  'What the call is called, and the public page''s h1 (#879). Worth having even on an event-linked call: "Queer Ride Day x 5bourough" is the event''s name, while the call might be "Zine Vol. 2 -- open call".';
comment on column public.event_artwork_calls.timezone is
  'IANA zone for rendering this call''s own deadline (#879). Null inherits the attached event''s; both null falls back to UTC, which the page labels rather than hides.';

-- The event becomes optional ---------------------------------------------------

-- Nothing else has to move. The composite foreign keys are MATCH SIMPLE, so a
-- null `event_id` skips enforcement rather than failing it, and Postgres treats
-- nulls as distinct in a unique index -- which means `unique (tenant_id,
-- event_id)` goes on meaning "one call per event" while any number of
-- eventless calls coexist beside each other. Both properties are load-bearing
-- here and both are the default; this comment exists so nobody "fixes" them
-- later with NULLS NOT DISTINCT.
alter table public.event_artwork_calls alter column event_id drop not null;
alter table public.artwork_submissions alter column event_id drop not null;

-- What the public page reads ---------------------------------------------------

-- LEFT JOIN now, and `display_timezone` rather than `event_timezone` (#876) --
-- the zone may come from the call itself, and a name that says "event" would be
-- a lie on every standalone call.
drop function if exists public.get_artwork_call(text, inet);

create function public.get_artwork_call(
  p_code text,
  p_ip_address inet default null
)
returns table (
  call_id uuid,
  title text,
  event_id uuid,
  event_name text,
  starts_at timestamptz,
  display_timezone text,
  location text,
  intro text,
  rights_note text,
  closes_at timestamptz,
  max_images integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
begin
  -- 30, not the 5 an intake form gets: this fires on every render of the page,
  -- including the reload a submitter does after a failed upload.
  if not public.check_rate_limit('get_artwork_call', p_ip_address, 30, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if v_tenant_id is null then
    return;
  end if;

  return query
  select c.id, c.title, c.event_id, e.name, e.starts_at,
         coalesce(c.timezone, e.timezone, 'UTC'), e.location,
         c.intro, c.rights_note, c.closes_at, c.max_images
    from public.event_artwork_calls c
    left join public.events e
      on e.id = c.event_id and e.tenant_id = c.tenant_id
   where c.tenant_id = v_tenant_id
     and c.submission_code = upper(btrim(coalesce(p_code, '')))
     and c.is_open
     and (c.opens_at is null or c.opens_at <= now())
     and (c.closes_at is null or c.closes_at >= now());
end;
$$;

grant execute on function public.get_artwork_call(text, inet) to anon, authenticated;

-- Storage paths move onto the call ---------------------------------------------

-- Objects were addressed `{tenant}/{event}/{draft}/{image}`, which has no
-- second segment once there is no event. They move to
-- `{tenant}/{call}/{draft}/{image}` -- arguably where they belonged from the
-- start, since the call is what owns them and what they cascade from.
--
-- Nothing is rewritten. Existing objects keep their old paths, existing rows
-- keep pointing at them, and every read goes through a signed URL built from
-- the stored path, so old and new coexist without a data migration. The purge
-- job walks the tree generically and does not care either way.
drop function if exists public.claim_artwork_upload_slots(text, integer, inet);

create function public.claim_artwork_upload_slots(
  p_code text,
  p_count integer,
  p_ip_address inet default null
)
returns table (
  tenant_id uuid,
  call_id uuid,
  max_images integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_call public.event_artwork_calls;
begin
  -- The tightest limit in this feature, because this is the one call that
  -- creates writable capacity in a paid-by-the-gigabyte bucket. Twenty slots
  -- per quarter hour is six full submissions.
  if not public.check_rate_limit('claim_artwork_upload_slots', p_ip_address, 20, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if v_tenant_id is null then
    raise exception 'CALL_CLOSED';
  end if;

  select c.* into v_call
    from public.event_artwork_calls c
   where c.tenant_id = v_tenant_id
     and c.submission_code = upper(btrim(coalesce(p_code, '')))
     and c.is_open
     and (c.opens_at is null or c.opens_at <= now())
     and (c.closes_at is null or c.closes_at >= now());

  if v_call.id is null then
    raise exception 'CALL_CLOSED';
  end if;

  if coalesce(p_count, 0) < 1 or p_count > v_call.max_images then
    raise exception 'TOO_MANY_IMAGES';
  end if;

  return query select v_call.tenant_id, v_call.id, v_call.max_images;
end;
$$;

grant execute on function public.claim_artwork_upload_slots(text, integer, inet) to anon, authenticated;

-- The intake -------------------------------------------------------------------

-- Carries #877's credit name, portfolio link and consent forward unchanged.
-- Two things move: the object-path prefix is built from the call rather than
-- the event, and `event_id` on the row is whatever the call has, including
-- nothing.
drop function if exists public.submit_artwork(text, text, text, text, text, text, jsonb, text, text, boolean, text, inet);

create function public.submit_artwork(
  p_code text,
  p_name text,
  p_email text,
  p_title text,
  p_medium text,
  p_statement text,
  p_images jsonb,
  p_credit_name text default null,
  p_portfolio_url text default null,
  p_consent boolean default false,
  p_honeypot text default null,
  p_ip_address inet default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_call public.event_artwork_calls;
  v_submission_id uuid;
  v_image jsonb;
  v_position integer := 0;
  v_portfolio text := nullif(btrim(coalesce(p_portfolio_url, '')), '');
  -- Built from the resolved ids rather than from a wildcard, so a path can
  -- only ever name an object inside this tenant's folder for this call.
  v_uuid text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v_prefix text;
begin
  if not public.check_rate_limit('submit_artwork', p_ip_address, 5, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  -- A filled honeypot gets an id for a row that was never written, so a bot
  -- sees the same success a person does and has nothing to tune against.
  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_consent is not true then
    raise exception 'CONSENT_REQUIRED';
  end if;
  if v_portfolio is not null and v_portfolio ~ '://' and v_portfolio !~* '^https?://' then
    raise exception 'INVALID_PORTFOLIO_URL';
  end if;

  if v_tenant_id is null then
    raise exception 'CALL_CLOSED';
  end if;

  select c.* into v_call
    from public.event_artwork_calls c
   where c.tenant_id = v_tenant_id
     and c.submission_code = upper(btrim(coalesce(p_code, '')))
     and c.is_open
     and (c.opens_at is null or c.opens_at <= now())
     and (c.closes_at is null or c.closes_at >= now());

  if v_call.id is null then
    raise exception 'CALL_CLOSED';
  end if;

  if p_images is null or jsonb_typeof(p_images) <> 'array' or jsonb_array_length(p_images) = 0 then
    raise exception 'IMAGES_REQUIRED';
  end if;
  if jsonb_array_length(p_images) > v_call.max_images then
    raise exception 'TOO_MANY_IMAGES';
  end if;

  insert into public.artwork_submissions (
    tenant_id, call_id, event_id, submitter_name, submitter_email, title, medium,
    artist_statement, credit_name, portfolio_url, consented_at
  )
  values (
    v_tenant_id,
    v_call.id,
    v_call.event_id,
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_title, '')), ''),
    nullif(btrim(coalesce(p_medium, '')), ''),
    nullif(btrim(coalesce(p_statement, '')), ''),
    -- Nested: the inner nullif turns an untouched field into null, the outer
    -- one turns "typed the same name again" into null too.
    nullif(nullif(btrim(coalesce(p_credit_name, '')), ''), btrim(p_name)),
    v_portfolio,
    now()
  )
  returning id into v_submission_id;

  -- The call id, or the event id for a draft whose files were uploaded under
  -- the old layout before this shipped. An artist part-way through a
  -- submission at deploy time should not have their upload refused; both
  -- segments are ids this server resolved, so the alternation widens nothing.
  v_prefix := '^' || v_tenant_id::text || '/('
    || v_call.id::text
    || coalesce('|' || v_call.event_id::text, '')
    || ')/' || v_uuid || '/' || v_uuid;

  for v_image in select * from jsonb_array_elements(p_images) loop
    if (v_image ->> 'path') !~ (v_prefix || '\.(jpg|jpeg|png|webp)$') then
      raise exception 'INVALID_IMAGE_PATH';
    end if;
    if (v_image ->> 'thumbPath') !~ (v_prefix || '-thumb\.jpg$') then
      raise exception 'INVALID_IMAGE_PATH';
    end if;
    if (v_image ->> 'contentType') not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'INVALID_IMAGE_PATH';
    end if;

    insert into public.artwork_submission_images (
      tenant_id, submission_id, storage_path, thumb_path, content_type, byte_size, position
    )
    values (
      v_tenant_id,
      v_submission_id,
      v_image ->> 'path',
      v_image ->> 'thumbPath',
      v_image ->> 'contentType',
      nullif(v_image ->> 'byteSize', '')::bigint,
      v_position
    );
    v_position := v_position + 1;
  end loop;

  return v_submission_id;
end;
$$;

grant execute on function public.submit_artwork(
  text, text, text, text, text, text, jsonb, text, text, boolean, text, inet
) to anon, authenticated;
