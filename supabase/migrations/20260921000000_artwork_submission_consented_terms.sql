-- #1319: keep the wording an artist actually agreed to.
--
-- `artwork_submissions.consented_at` (#877) records when a submitter affirmed
-- the work is theirs and accepted the call's terms. What they accepted is
-- `event_artwork_calls.rights_note` (#876) -- the consent checkbox on the
-- public page deliberately points at that text rather than restating it. But
-- `updateArtworkCallAction()` rewrites the note in place, so a curator who
-- reasonably tightens it mid-call leaves every earlier submission's timestamp
-- pointing at wording that no longer exists.
--
-- #877's own comment stated the intent this misses: a timestamp puts the
-- agreement next to the call's rights_note "as it stood that day". Today the
-- timestamp survives and the text is overwritten.
--
-- The fix is a snapshot on the accepting row, not a version table. An open
-- call's rights note is read by exactly one thing and accepted by exactly one
-- thing, so storing it here needs no version identity, no join and no "which
-- version is in force" question, and cannot drift from the submission it
-- belongs to. The version-table shape earns its cost only when the text has to
-- be citable from outside the row that accepted it -- which is #601's problem
-- for the site-wide legal documents, and not this one.

alter table public.artwork_submissions
  -- Null and empty string are not the same fact. Null is "this call stated no
  -- rights or credit terms", which is the existing case the checkbox wording
  -- already branches on; an empty string would mean terms that said nothing.
  -- Nothing writes the latter, and nothing reading this column should collapse
  -- the two.
  add column consented_terms text;

comment on column public.artwork_submissions.consented_terms is
  'The call''s rights_note (#876) as it stood when this submission was accepted (#1319). Written by submit_artwork() from the call row, never from the client. Null means the call stated no terms. Never redacted by the audit trigger, for the same reason consented_at is not: the organization''s own published text, not the submitter''s prose.';

-- Deliberately not added to artwork_submissions' redacted column list in
-- audited_tables (20260909040000), which holds `submitter_email` and
-- `artist_statement` -- the submitter's address and their personal prose. A
-- redacted consent record is not a record.

-- Backfill ---------------------------------------------------------------------

-- Say plainly what these values are: the rights note as it stands *now*, not
-- necessarily the wording any of these submitters was shown. Every row written
-- before this migration is of unknown vintage and nothing in the schema can
-- recover the real text. An honest unknown-vintage snapshot beats no snapshot;
-- one that silently looks authoritative is worse than both. If that
-- distinction ever has to be drawn from data, `consented_at` against this
-- migration's deploy time is where it lives.
update public.artwork_submissions s
   set consented_terms = c.rights_note
  from public.event_artwork_calls c
 where c.id = s.call_id
   and c.tenant_id = s.tenant_id
   and c.rights_note is not null
   and s.consented_at is not null;

-- Intake -----------------------------------------------------------------------

-- Same argument list, so a plain replace: the snapshot is read off the call row
-- already selected above, in the same statement that sets consented_at, and
-- the client neither sends it nor can influence it.
create or replace function public.submit_artwork(
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
) returns uuid
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

  -- #902
  if not public.module_enabled_for_tenant(v_tenant_id, 'artwork') then
    raise exception 'CALL_CLOSED';
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
    artist_statement, credit_name, portfolio_url, consented_at, consented_terms
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
    now(),
    -- Stored verbatim, unlike every other text column here: this is the
    -- organization's published wording and trimming or emptying it would edit
    -- the thing the record exists to preserve. The one normalisation is that a
    -- note holding nothing but whitespace is the same fact as no note.
    nullif(btrim(coalesce(v_call.rights_note, '')), '')
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
