-- #877: who gets credited, where to find them, and what they agreed to.
--
-- The form shipped in #870 collects one name and no assent. Three columns and
-- a wider submit_artwork() close that.

-- Columns ---------------------------------------------------------------------

alter table public.artwork_submissions
  -- `submitter_name` is the contact name; this is the one that gets printed.
  -- Two fields rather than one because artists routinely want them to differ --
  -- a legal name for correspondence, a chosen name or a handle for the page --
  -- and resolving that the wrong way means printing someone's legal name in a
  -- queer community zine. Nullable, and null means "credit me as
  -- submitter_name": an artist who does not care should not have to type their
  -- name twice, and a default carried in data is easier to get wrong than one
  -- resolved at the point of use.
  add column credit_name text,
  -- Where to find more of their work. Free text rather than a url column: a
  -- great many artists will type an @handle, and refusing that in favour of a
  -- fully-qualified profile URL is a worse form for no gain. What the schema
  -- does enforce is that anything URL-shaped is http(s), so a reviewer's
  -- client cannot be handed a javascript: or data: target to render.
  add column portfolio_url text
    check (
      portfolio_url is null
      or portfolio_url !~ '://'
      or portfolio_url ~* '^https?://'
    ),
  -- When they agreed, not whether. A boolean records that some consent was
  -- taken at some unknown point against unknown wording; a timestamp puts the
  -- agreement next to the call's rights_note (#876) as it stood that day, and
  -- that is the pair that answers "what did this artist actually agree to?"
  -- when someone asks in two years.
  add column consented_at timestamptz;

comment on column public.artwork_submissions.credit_name is
  'Name to print. Null means credit as submitter_name (#877) -- resolve at the point of use, do not backfill.';
comment on column public.artwork_submissions.consented_at is
  'When the submitter affirmed the work is theirs and accepted the call''s terms (#877). Never redacted by the audit trigger: a redacted consent record is not a record.';

-- Deliberately not added to artwork_submissions' redacted column list in
-- audited_tables (20260909040000). `submitter_email` and `artist_statement` are
-- redacted there because they are the submitter's personal prose and address;
-- a credit name is destined for print, a portfolio link is already public, and
-- a consent timestamp is the one thing the audit trail most needs to keep.

-- Intake ----------------------------------------------------------------------

-- Three new arguments, so this is a drop and a recreate: CREATE OR REPLACE with
-- a different argument list defines a second, overloaded function rather than
-- replacing the first, and two submit_artwork()s reachable by `anon` is exactly
-- the ambiguity not to leave lying around.
--
-- Order inside is unchanged and load-bearing: rate limit, honeypot, validation,
-- tenant, then the write. The consent check sits with the other validations,
-- *after* the honeypot, so a bot that fills every field on the page still gets
-- the same fabricated success it got before and learns nothing from having
-- ticked the box.
drop function if exists public.submit_artwork(text, text, text, text, text, text, jsonb, text, inet);

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
  -- only ever name an object inside this tenant's folder for this event. The
  -- three uuid segments are the draft id and the image id, both minted by the
  -- Server Action; guessing one is not a threat model, but a `../` in a
  -- hand-rolled request is, and this is what refuses it.
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
  -- Mirrors the check constraint, so a bad link is a message rather than a
  -- 23514 the caller has to decode.
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
    -- Stored only when it actually differs from the contact name, so "credited
    -- differently" stays a fact about the row rather than something a reviewer
    -- has to work out by comparing two strings.
    -- Nested: the inner nullif turns an untouched field into null, the outer
    -- one turns "typed the same name again" into null too.
    nullif(nullif(btrim(coalesce(p_credit_name, '')), ''), btrim(p_name)),
    v_portfolio,
    now()
  )
  returning id into v_submission_id;

  v_prefix := '^' || v_tenant_id::text || '/' || v_call.event_id::text || '/' || v_uuid || '/' || v_uuid;

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
