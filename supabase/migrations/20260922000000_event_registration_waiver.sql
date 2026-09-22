-- Participant waiver: acceptance recorded on the registration (#686)
-- ---------------------------------------------------------------------------
--
-- `legal.waiver` is the fourth legal document and the first with no platform
-- text behind it: a release of legal rights cannot be written for an
-- organization that has not written it (`docs/legal-basis.md`). A tenant that
-- has published none is untouched by everything here -- nothing is asked at
-- registration and both columns below stay null.
--
-- Where one *is* adopted, the agreement is shown in full at registration and
-- accepted with a box that starts unticked, and the registration records when
-- and which version. That is a real, scoped acceptance, which is what #1318
-- said the public forms do not otherwise take: it is separate from the privacy
-- notice, it can be declined by simply not registering, and it points at text
-- the reader was actually shown.
--
-- A VERSION POINTER, NOT A SNAPSHOT, and this is exactly where #1319 argued
-- the other way and was right to. Its own words give the test: "the
-- version-table shape earns its cost only when the text has to be citable from
-- outside the row that accepted it." An artwork call's rights_note has no
-- identity and no address, so it is copied onto the submission. A waiver has
-- both since #601 -- `legal_document_versions` is append-only with no delete
-- path, and /waiver?version=N is a public permalink a registrant can be sent
-- -- so copying a whole document onto every registration would buy nothing and
-- cost a great deal.
--
-- No foreign key, deliberately. `document` is half the referenced key and is
-- the constant 'waiver' here, so a real reference would need a generated
-- column for no benefit: `legal_document_versions` has no delete policy, no
-- delete path and no truncate grant, so the pointer cannot dangle.

alter table public.event_registrations
  add column waiver_accepted_at timestamptz,
  add column waiver_version integer,
  -- Written together or not at all: a timestamp with no version cannot say
  -- what was accepted, and a version with no timestamp is not an acceptance.
  add constraint event_registrations_waiver_pair
    check ((waiver_accepted_at is null) = (waiver_version is null)),
  add constraint event_registrations_waiver_version_positive
    check (waiver_version is null or waiver_version > 0);

comment on column public.event_registrations.waiver_accepted_at is
  'When this registrant accepted the organization''s participant waiver (#686). Null means NOTHING WAS ASKED -- no waiver was in force for this tenant at the time -- and must never be read as a refusal. Declining is not submitting: the RPC refuses the registration, so a refusal produces no row at all and there is nothing here to record it. Survives retention anonymization beside party_size and checked_in_at.';

comment on column public.event_registrations.waiver_version is
  'Which legal_document_versions row (document = ''waiver'', same tenant) this registrant accepted (#686). Resolved server-side from the version in force at the moment of the insert, never from the client, and readable by a person at /waiver?version=N. No foreign key -- see this migration''s header.';

-- Retention: both columns are left alone by the event_registrations rule in
-- 20260905170000, which strips name, email, phone, notes, instagram_handle,
-- pronouns and person_id after three years and keeps party_size, checked_in_at
-- and the *_at_event snapshots. These belong with the second group: an
-- acceptance is a fact about an act and about the organization's own published
-- text, not the registrant's personal prose, and #1319 made the same call --
-- "a redacted consent record is not a record".
--
-- Worth naming and not solving here: after anonymization the row reads
-- "Removed accepted waiver v2", so the acceptance survives but can no longer
-- be tied to a person, and three years is short against the limitation periods
-- that make a waiver worth holding at all. The honest answers -- a separate
-- acceptances table with its own clock, or exempting waiver-bearing
-- registrations from the name/email strip -- are retention decisions rather
-- than engineering ones. Recorded in #1320 group E.
--
-- `audited_tables` has no row for event_registrations and gets none here: the
-- table is a public write path, and starting to audit every registration and
-- check-in to hold two columns would be a large change smuggled in as a small
-- one. So `redacted_columns` does not arise.

-- ---------------------------------------------------------------------------
-- What the two registration paths ask, and what they record
-- ---------------------------------------------------------------------------
--
-- One function rather than the same four branches written twice. The anonymous
-- and signed-in registration RPCs must not be able to disagree about whether a
-- waiver is required, and the failure would be silent in the direction that
-- matters: a constituent account becoming the way to register without
-- accepting anything.

create function public.accepted_waiver_version(
  p_tenant_id uuid,
  p_accepted boolean,
  p_claimed_version integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_in_force boolean;
  v_version integer;
begin
  select (s.value = to_jsonb(true)) into v_in_force
    from public.app_settings s
   where s.tenant_id = p_tenant_id
     and s.key = 'legal_publication.waiver';

  -- Not adopted: nothing was asked, nothing is recorded, and the registration
  -- proceeds exactly as it did before this shipped. This is the state every
  -- tenant starts in and most stay in.
  if not coalesce(v_in_force, false) then
    return null;
  end if;

  select max(v.version) into v_version
    from public.legal_document_versions v
   where v.tenant_id = p_tenant_id
     and v.document = 'waiver';

  -- In force with nothing to show. The adoption toggle and
  -- publish_site_content() both refuse to create this, so reaching it means
  -- somebody wrote site_content directly -- which is how a seed or a
  -- hand-written migration would do it, since versions are written only by
  -- publish_site_content(). Refuse the registration rather than quietly take
  -- one without the waiver this organization said governs taking part.
  --
  -- Before the acceptance check, not after: "please accept the waiver" is a
  -- dishonest thing to say when there is no waiver to show.
  if v_version is null then
    raise exception 'WAIVER_UNAVAILABLE';
  end if;

  if p_accepted is not true then
    raise exception 'WAIVER_REQUIRED';
  end if;

  -- The version the reader was shown, checked against the one in force.
  -- Nothing can be forged with it: it is only ever compared, never stored, and
  -- the value written is the one read here. A republish between render and
  -- submit is a different document, and recording acceptance of text nobody
  -- read is the failure the pointer exists to prevent. Null -- an older client
  -- that does not send it -- is accepted rather than refused, because the
  -- acceptance is still of the version in force at the moment of the insert.
  if p_claimed_version is not null and p_claimed_version <> v_version then
    raise exception 'WAIVER_CHANGED';
  end if;

  return v_version;
end;
$$;

comment on function public.accepted_waiver_version(uuid, boolean, integer) is
  'Resolves what a registration should record about the participant waiver (#686), and refuses the registration where it must. Returns null when the tenant has no waiver in force, the version in force when the caller accepted it, and raises WAIVER_UNAVAILABLE, WAIVER_REQUIRED or WAIVER_CHANGED otherwise. Shared by register_for_event() and register_myself_for_event() so the two paths cannot disagree.';

-- Internal to the two registration RPCs, which are SECURITY DEFINER and call
-- it with a tenant they resolved themselves. Nothing public needs it.
revoke execute on function public.accepted_waiver_version(uuid, boolean, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Anonymous registration
-- ---------------------------------------------------------------------------
--
-- Two trailing parameters change the signature, so this drops before
-- recreating (see 20260826190000's note). The body is otherwise unchanged from
-- 20260919030000.
drop function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean);

create function public.register_for_event(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_party_size integer,
  p_notes text,
  p_honeypot text default null,
  p_ip_address inet default null,
  p_instagram_handle text default null,
  p_pronouns text default null,
  p_attended_before boolean default null,
  p_waiver_accepted boolean default false,
  p_waiver_version integer default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_existing_party_size integer;
  v_registration_id uuid;
  v_person_id uuid;
  v_pronouns text := nullif(btrim(p_pronouns), '');
  v_tenant_id uuid := public.public_tenant_id();
  v_waiver_version integer;
begin
  if not public.check_rate_limit('register_for_event', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  if v_tenant_id is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  -- #902
  if not public.module_enabled_for_tenant(v_tenant_id, 'events') then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  select capacity, registration_enabled, registration_deadline, auto_assign_discount_codes
  into v_event
  from public.events
  where id = p_event_id
    and tenant_id = v_tenant_id
    and visibility = 'public'
    and status = 'published';

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not v_event.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if v_event.registration_deadline is not null and v_event.registration_deadline < now() then
    raise exception 'REGISTRATION_DEADLINE_PASSED';
  end if;

  -- #1206: the same floor submit_volunteer_application() has always had. The
  -- check constraint below refuses the row either way; this is so a public
  -- caller gets a message it can act on rather than a 23514.
  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  if p_party_size is null or p_party_size < 1 then
    raise exception 'INVALID_PARTY_SIZE';
  end if;

  if char_length(v_pronouns) > 40 then
    raise exception 'PRONOUNS_TOO_LONG';
  end if;

  -- After the honeypot's early return, so a bot learns nothing about whether
  -- this organization takes a waiver, and before the capacity lock, so a
  -- refusal does not queue behind other registrations for a row it will never
  -- write.
  v_waiver_version := public.accepted_waiver_version(
    v_tenant_id, p_waiver_accepted, p_waiver_version
  );

  if v_event.capacity is not null then
    -- Take the event row before counting seats, so concurrent registrations
    -- queue behind each other and every one of them sums a table that already
    -- contains the ones ahead of it. Held until this transaction commits,
    -- which is what makes the check below binding rather than advisory. Only
    -- capped events pay for it; an uncapped event never reaches this branch.
    perform 1 from public.events
     where id = p_event_id and tenant_id = v_tenant_id
     for update;

    select coalesce(sum(party_size), 0) into v_existing_party_size
    from public.event_registrations
    where event_id = p_event_id;

    if v_existing_party_size + p_party_size > v_event.capacity then
      raise exception 'EVENT_AT_CAPACITY';
    end if;
  end if;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', null, p_instagram_handle, v_pronouns, v_tenant_id
  );

  -- p_attended_before is stored as given, null included: an unanswered
  -- question is unanswered, and coalescing it to false here would invent a
  -- "no" for everybody who skipped it. It is deliberately not written back to
  -- `people` -- it describes this registration's moment, and the person's own
  -- history is the check-in ledger.
  insert into public.event_registrations
    (tenant_id, event_id, name, email, phone, party_size, notes, person_id, instagram_handle, pronouns, attended_before,
     waiver_accepted_at, waiver_version)
  values
    (v_tenant_id, p_event_id, p_name, p_email, p_phone, p_party_size, p_notes, v_person_id, p_instagram_handle, v_pronouns, p_attended_before,
     case when v_waiver_version is null then null else now() end, v_waiver_version)
  returning id into v_registration_id;

  if v_event.auto_assign_discount_codes then
    update public.discount_codes
    set registration_id = v_registration_id,
        assigned_at = now()
    where id = (
      select id
      from public.discount_codes
      where event_id = p_event_id
        and registration_id is null
      order by created_at asc
      for update skip locked
      limit 1
    );
  end if;

  return v_registration_id;
exception
  when unique_violation then
    raise exception 'ALREADY_REGISTERED';
end;
$$;

comment on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer) is
  'Anonymous public registration for a published public event. Asks every registrant whether they have been before (#1259) and stores the answer verbatim, null included; nothing it does varies with whether the email matched a directory record. Where the tenant has a participant waiver in force (#686), acceptance is required and the version accepted is recorded on the registration.';

grant execute on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Registering as yourself
-- ---------------------------------------------------------------------------
--
-- Body otherwise unchanged from 20260919030000.
drop function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean);

create function public.register_myself_for_event(
  p_event_id uuid,
  p_party_size integer,
  p_notes text default null,
  p_phone text default null,
  p_pronouns text default null,
  p_instagram_handle text default null,
  p_ip_address inet default null,
  p_attended_before boolean default null,
  p_waiver_accepted boolean default false,
  p_waiver_version integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_person_id uuid;
  v_person record;
  v_event record;
  v_existing_party_size integer;
  v_registration_id uuid;
  v_pronouns text := nullif(btrim(coalesce(p_pronouns, '')), '');
  v_handle text := public.normalize_instagram_handle(p_instagram_handle);
  v_waiver_version integer;
begin
  -- Same route budget as the anonymous form. A signed-in caller is not more
  -- trustworthy for this purpose: an account costs an email address, and the
  -- write it reaches is the same table.
  if not public.check_rate_limit('register_myself_for_event', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  v_person_id := public.my_constituent_person_id('events');
  if v_person_id is null then
    raise exception 'NO_RECORD';
  end if;

  select capacity, registration_enabled, registration_deadline, auto_assign_discount_codes
  into v_event
  from public.events
  where id = p_event_id
    and tenant_id = v_tenant_id
    and visibility = 'public'
    and status = 'published';

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not v_event.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if v_event.registration_deadline is not null and v_event.registration_deadline < now() then
    raise exception 'REGISTRATION_DEADLINE_PASSED';
  end if;

  if p_party_size is null or p_party_size < 1 then
    raise exception 'INVALID_PARTY_SIZE';
  end if;

  if char_length(v_pronouns) > 40 then
    raise exception 'PRONOUNS_TOO_LONG';
  end if;

  -- Asked of a signed-in caller exactly as it is of an anonymous one. Holding
  -- an account is not agreement to anything: the waiver is about taking part,
  -- and a path around it would be the shortest way to a registration with no
  -- acceptance behind it.
  v_waiver_version := public.accepted_waiver_version(
    v_tenant_id, p_waiver_accepted, p_waiver_version
  );

  if v_event.capacity is not null then
    -- The same lock register_for_event() takes (20260907130000): hold the
    -- event row before summing seats, so concurrent registrations queue and
    -- each one counts a table that already holds the ones ahead of it. The two
    -- functions taking the same lock on the same row is what makes the check
    -- binding across *both* paths rather than only within each.
    perform 1 from public.events
     where id = p_event_id and tenant_id = v_tenant_id
     for update;

    select coalesce(sum(party_size), 0) into v_existing_party_size
    from public.event_registrations
    where event_id = p_event_id;

    if v_existing_party_size + p_party_size > v_event.capacity then
      raise exception 'EVENT_AT_CAPACITY';
    end if;
  end if;

  select coalesce(nullif(btrim(p.preferred_name), ''), p.name) as display_name,
         coalesce(nullif(btrim(p.email), ''), '') as email
    into v_person
    from public.people p
   where p.id = v_person_id;

  insert into public.event_registrations
    (tenant_id, event_id, name, email, phone, party_size, notes, person_id,
     instagram_handle, pronouns, attended_before, waiver_accepted_at, waiver_version)
  values
    (v_tenant_id, p_event_id, v_person.display_name, v_person.email,
     nullif(btrim(coalesce(p_phone, '')), ''), p_party_size,
     nullif(btrim(coalesce(p_notes, '')), ''), v_person_id, v_handle, v_pronouns,
     p_attended_before, case when v_waiver_version is null then null else now() end,
     v_waiver_version)
  returning id into v_registration_id;

  if v_event.auto_assign_discount_codes then
    update public.discount_codes
    set registration_id = v_registration_id,
        assigned_at = now()
    where id = (
      select id
      from public.discount_codes
      where event_id = p_event_id
        and registration_id is null
      order by created_at asc
      for update skip locked
      limit 1
    );
  end if;

  return v_registration_id;
exception
  when unique_violation then
    -- event_registrations_event_person_key (20260901010000) is the one that
    -- fires here: one registration per known person per event. The email index
    -- can fire too, when a staffer already added this person to the event by
    -- hand under the same address, and it means the same thing to the reader.
    raise exception 'ALREADY_REGISTERED';
end;
$$;

comment on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer) is
  'Registers the signed-in caller for a published public event under their own people row (#1165). Never matches or creates a person: the record is auth.uid() on the request host, so this path cannot produce a duplicate. Corrections travel on the registration and are not written back to people. Asks the same self-reported "been here before?" question the anonymous form does (#1259), and takes the same participant waiver the anonymous form does where one is in force (#686).';

revoke execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer) from public, anon;
grant execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Publishing cannot empty a waiver that is in force
-- ---------------------------------------------------------------------------
--
-- Signature unchanged, so this replaces in place. Body otherwise unchanged
-- from 20260921060000.

create or replace function public.publish_site_content(
  p_keys text[],
  p_legal_surface jsonb default null,
  p_approval jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_count integer;
  -- `legal_surface.*` keys, already built from the slots that published: the
  -- ones now serving the tenant's own text, and the ones handed back to the
  -- platform's.
  v_own text[];
  v_reverted text[];
  -- document key -> published value, for the version rows below. Only the
  -- slots that actually published, and only the ones that published text: a
  -- revert to the platform's default is the absence of a version, not a
  -- version of nothing.
  v_versioned jsonb;
  -- One instant for the whole publish, so a page's documents share an
  -- effective date and none of them disagrees with its own fingerprint.
  v_now timestamptz := now();
  -- Frozen onto each version row: see the column comment.
  v_zone text;
  v_gated boolean;
  v_reference text;
  v_notes text;
begin
  if v_tenant is null then
    raise exception 'NO_TENANT';
  end if;
  if not public.has_permission('site_content', 'manage') then
    raise exception 'FORBIDDEN';
  end if;
  if p_keys is null or array_length(p_keys, 1) is null then
    return 0;
  end if;

  -- Whether this publish has to carry an approval: the tenant's setting, and a
  -- `legal.*` slot among the ones that will actually publish. A key named with
  -- no pending draft publishes nothing, and demanding an approval for nothing
  -- would refuse a publish of the twelve other pages because a legal slot was
  -- in the list and unchanged.
  v_gated := coalesce(
    (select s.value = to_jsonb(true)
       from public.app_settings s
      where s.tenant_id = v_tenant
        and s.key = 'legal_approval.required'),
    false)
    and exists (
      select 1 from public.site_content sc
      where sc.tenant_id = v_tenant
        and sc.key = any(p_keys)
        and sc.key like 'legal.%'
        and sc.has_draft
    );

  -- The other half of #686's gate. `updateLegalPublicationAction` refuses to
  -- put the participant waiver in force while the tenant has published no
  -- text; this refuses the reverse -- a publish that would take the text out
  -- from under a waiver already in force, leaving /waiver empty and every
  -- event registration refused for want of a document to show.
  --
  -- Named rather than derived: `hasPlatformDefault` lives in
  -- `src/lib/legal-documents.ts` and the waiver is the only document it is
  -- false for. If a second one is ever added, this list grows with it, and
  -- `legal-documents.test.ts` is where that would be noticed.
  if exists (
    select 1
      from public.site_content sc
      join public.app_settings pub
        on pub.tenant_id = v_tenant
       and pub.key = 'legal_publication.' || substring(sc.key from 7)
     where sc.tenant_id = v_tenant
       and sc.key = any(p_keys)
       and sc.key = 'legal.waiver'
       and sc.has_draft
       and sc.draft_value is null
       and pub.value = to_jsonb(true)
  ) then
    raise exception 'LEGAL_TEXT_REQUIRED';
  end if;

  if v_gated then
    v_reference := nullif(btrim(coalesce(p_approval ->> 'reference', '')), '');
    v_notes := nullif(btrim(coalesce(p_approval ->> 'notes', '')), '');
    if v_reference is null or v_notes is null then
      raise exception 'APPROVAL_REQUIRED';
    end if;

    -- The four eyes. A draft with no recorded author is refused rather than
    -- waved through: `draft_updated_by` is null only where there was no
    -- session behind the write -- a service-role script -- and "we cannot tell
    -- who wrote this" is not a second pair of eyes.
    if exists (
      select 1 from public.site_content sc
      where sc.tenant_id = v_tenant
        and sc.key = any(p_keys)
        and sc.key like 'legal.%'
        and sc.has_draft
        and sc.draft_updated_by is null
    ) then
      raise exception 'APPROVAL_DRAFTER_UNKNOWN';
    end if;
    if exists (
      select 1 from public.site_content sc
      where sc.tenant_id = v_tenant
        and sc.key = any(p_keys)
        and sc.key like 'legal.%'
        and sc.has_draft
        and sc.draft_updated_by = auth.uid()
    ) then
      raise exception 'APPROVAL_SELF';
    end if;
  end if;

  -- A draft of NULL publishes as NULL, which is the slot going back to the
  -- registry default. The row stays, so the revert keeps an author and a date
  -- rather than vanishing; `public_site_content` filters it out.
  --
  -- The approval columns are written on every publish rather than only on a
  -- gated one, because the other direction is clearing them: an approval left
  -- behind from last month would sit beside text nobody approved, and
  -- `audit_log` would snapshot it as though they belonged together.
  --
  -- The published keys are captured rather than re-read: the fingerprint and
  -- the version rows must describe documents that actually changed. A caller
  -- may name a slot with no pending draft -- nothing publishes, and stamping
  -- that slot with today's surface would mark a stale document fresh, which is
  -- that feature's own failure mode written by its own hand. A version row for
  -- it would be worse still: a second version identical to the first, with a
  -- date claiming the organization republished on a day it did nothing.
  with published as (
    update public.site_content
    set value = draft_value,
        draft_value = null,
        has_draft = false,
        approved_by = case when v_gated and key like 'legal.%'
                           then auth.uid() end,
        approved_at = case when v_gated and key like 'legal.%'
                           then v_now end,
        approval_reference = case when v_gated and key like 'legal.%'
                                  then v_reference end,
        review_notes = case when v_gated and key like 'legal.%'
                            then v_notes end
    where tenant_id = v_tenant
      and key = any(p_keys)
      and has_draft
    returning key, value
  )
  select count(*)::integer,
         coalesce(
           array_agg('legal_surface.' || substring(key from 7))
             filter (where key like 'legal.%' and value is not null),
           '{}'),
         coalesce(
           array_agg('legal_surface.' || substring(key from 7))
             filter (where key like 'legal.%' and value is null),
           '{}'),
         jsonb_object_agg(substring(key from 7), value)
           filter (where key like 'legal.%' and value is not null)
    into v_count, v_own, v_reverted, v_versioned
  from published;

  -- The version rows, in the same transaction as the publish they record.
  -- Either the public site has the new text and the history has the row, or
  -- neither happened; a snapshot that can be missing is not a record.
  --
  -- The number is taken here under `legal_document_versions_number`, so two
  -- administrators publishing the same document at the same moment produce two
  -- versions rather than one silently winning. The loser of the race fails on
  -- the unique and takes its whole publish down with it, which is the right
  -- way round: the alternative is a publish that succeeded with no version
  -- behind it.
  if v_versioned is not null then
    select coalesce(s.value #>> '{}', 'UTC') into v_zone
    from public.app_settings s
    where s.tenant_id = v_tenant and s.key = 'org.timezone';

    insert into public.legal_document_versions
      (tenant_id, document, version, content, surfaces, effective_at, time_zone, created_by)
    select v_tenant,
           doc.key,
           coalesce(
             (select max(existing.version)
                from public.legal_document_versions existing
               where existing.tenant_id = v_tenant
                 and existing.document = doc.key),
             0) + 1,
           doc.value,
           p_legal_surface -> 'surfaces',
           v_now,
           coalesce(v_zone, 'UTC'),
           auth.uid()
    from jsonb_each(v_versioned) as doc(key, value);
  end if;

  if p_legal_surface is not null then
    -- Only a tenant's own text has a fingerprint. Publishing a NULL over a
    -- `legal.*` slot hands the route back to the platform's document, which is
    -- regenerated from the live configuration on every request and so cannot
    -- go stale -- and a fingerprint left behind would describe a document
    -- nobody is serving.
    delete from public.app_settings
    where tenant_id = v_tenant
      and key = any(v_reverted);

    insert into public.app_settings (tenant_id, key, value, updated_by)
    select v_tenant,
           fingerprint.setting_key,
           p_legal_surface || jsonb_build_object('published_at', v_now),
           auth.uid()
    from unnest(v_own) as fingerprint(setting_key)
    on conflict (tenant_id, key) do update
      set value = excluded.value,
          updated_by = excluded.updated_by;
  end if;

  return v_count;
end;
$$;

comment on function public.publish_site_content(text[], jsonb, jsonb) is
  'Moves the named slots'' drafts onto the public site for the caller''s tenant, in one statement so a page publishes atomically (#793). SECURITY DEFINER because `value` is not writable by `authenticated` at all: this is the only way to publish. `p_legal_surface` (#1292) is the collection surface the caller computed for this tenant, stored as legal_surface.<document> for each `legal.*` slot that actually published. `p_approval` (#600) is {"reference", "notes"}, required -- from somebody other than the drafter -- when the tenant has legal_approval.required on and a legal.* slot is among the ones publishing; it is recorded on the rows it approves, and cleared from every other publish so that no approval outlives the text it was given for. Every `legal.*` slot that publishes text also appends a legal_document_versions row (#601), in the same transaction: this function is that table''s only writer.';
