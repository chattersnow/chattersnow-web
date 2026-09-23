-- The participant agreement kept on file for a linked person (#1401)
-- ---------------------------------------------------------------------------
--
-- Until now a waiver acceptance lived only on the registration that took it
-- (#686), so a returning, signed-in participant re-read and re-ticked the same
-- version of the same agreement on every event. This records the acceptance
-- against the *person* as well -- per tenant, per version -- and lets the
-- signed-in path reuse it while that version stays in force.
--
-- LINKED ACCOUNTS ONLY. The only writer is register_myself_for_event(), whose
-- person is auth.uid() on the request host through an approved claim (#1162).
-- register_for_event() matches or mints a person by email, and an email match
-- is not identity -- anyone can type anyone's address -- so an anonymous
-- acceptance is never put on anybody's file, and the anonymous form always
-- shows the whole agreement.
--
-- A REPUBLISH ASKS AGAIN. On file means "accepted the version in force now",
-- never "accepted some version once": the lookup below is keyed on the latest
-- version, so publishing a new one makes every person's file stale at once.
-- That is the gap in Mindbody's per-client flag, which never re-prompts
-- existing clients when the waiver changes.
--
-- THE REGISTRATION RECORD KEEPS ITS MEANING. Every registration still carries
-- waiver_version / waiver_accepted_at. Where the acceptance came off the file,
-- the registration copies the file's version and timestamp, so "which version
-- did this registrant accept, and when" is answered on the row exactly as it
-- was before. The pair can therefore predate the registration's created_at,
-- which is the truth: that is when they accepted it.
--
-- Not built: an expiry (per season, as Smartwaiver and WaiverForever offer).
-- If a tenant wants one it is a filter on accepted_at in waiver_on_file(),
-- plus a setting to hold the period.

create table public.person_waiver_acceptances (
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  person_id uuid not null,
  -- A legal_document_versions row with document = 'waiver' in this tenant. No
  -- foreign key, for the reason 20260922000000 gives for the registration's
  -- own pointer: that table is append-only, so the pointer cannot dangle.
  version integer not null check (version > 0),
  accepted_at timestamptz not null default now(),
  primary key (tenant_id, person_id, version),
  -- Removing a person removes their file. Their registrations keep their own
  -- copy of each acceptance, which is the record the organization relies on.
  constraint person_waiver_acceptances_person_fkey
    foreign key (tenant_id, person_id)
    references public.people (tenant_id, id) on delete cascade
);

comment on table public.person_waiver_acceptances is
  'Which versions of the participant agreement a linked person has accepted (#1401), so a signed-in registrant is not asked again for a version already on file. Written only by register_myself_for_event(); an anonymous registration never writes here, because an email match is not identity. Read only through waiver_on_file() and my_waiver_on_file(). Each registration still copies the version and timestamp it relied on into event_registrations.waiver_version / waiver_accepted_at.';

-- No policies and no grants: nothing reads or writes this table directly. The
-- two functions below are SECURITY DEFINER and carry their own tenant and
-- person predicates, and staff already see each acceptance on the
-- registration it was used for.
alter table public.person_waiver_acceptances enable row level security;
revoke all on public.person_waiver_acceptances from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What is on file
-- ---------------------------------------------------------------------------

create function public.waiver_on_file(p_tenant_id uuid, p_person_id uuid)
returns table (version integer, accepted_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  -- The same "in force" accepted_waiver_version() reads: adopted, and the
  -- latest published version. Anything short of both is nothing on file.
  select a.version, a.accepted_at
    from public.person_waiver_acceptances a
   where a.tenant_id = p_tenant_id
     and a.person_id = p_person_id
     and exists (
       select 1 from public.app_settings s
        where s.tenant_id = p_tenant_id
          and s.key = 'legal_publication.waiver'
          and s.value = to_jsonb(true)
     )
     and a.version = (
       select max(v.version) from public.legal_document_versions v
        where v.tenant_id = p_tenant_id
          and v.document = 'waiver'
     );
$$;

comment on function public.waiver_on_file(uuid, uuid) is
  'The person''s acceptance of the participant agreement version in force now (#1401), or no row: none in force, never accepted, or accepted only an older version. Internal to register_myself_for_event() and my_waiver_on_file().';

revoke execute on function public.waiver_on_file(uuid, uuid) from public, anon, authenticated;

create function public.my_waiver_on_file()
returns table (version integer, accepted_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select f.version, f.accepted_at
    from public.waiver_on_file(
      public.public_tenant_id(),
      public.my_constituent_person_id('events')
    ) f;
$$;

comment on function public.my_waiver_on_file() is
  'The signed-in caller''s acceptance of the participant agreement in force on the request host (#1401), or no row. What the event page reads to show a one-line summary in place of the agreement and its box.';

revoke execute on function public.my_waiver_on_file() from public, anon;
grant execute on function public.my_waiver_on_file() to authenticated;

-- ---------------------------------------------------------------------------
-- Registering as yourself
-- ---------------------------------------------------------------------------
--
-- Same signature, so a replace rather than a drop. The body is unchanged from
-- 20260922070000 except where it resolves the waiver and writes the pair.
create or replace function public.register_myself_for_event(
  p_event_id uuid,
  p_party_size integer,
  p_notes text default null,
  p_phone text default null,
  p_pronouns text default null,
  p_instagram_handle text default null,
  p_ip_address inet default null,
  p_attended_before boolean default null,
  p_waiver_accepted boolean default false,
  p_waiver_version integer default null,
  p_party_includes_minor boolean default null,
  p_accompanying_adult_name text default null,
  p_accompanying_adult_phone text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_photo_consent boolean default null
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
  v_waiver_accepted_at timestamptz;
  v_minor public.minor_accompaniment_contacts;
  v_photo public.photo_consent_record;
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
  -- an account says nothing about who is coming with you.
  v_minor := public.resolve_minor_contacts(
    p_party_includes_minor,
    p_accompanying_adult_name,
    p_accompanying_adult_phone,
    p_emergency_contact_name,
    p_emergency_contact_phone
  );

  -- #1401. An unticked box is fine when this person already accepted the
  -- version in force: the form showed them a one-line summary instead of the
  -- agreement, and the registration copies what is on file.
  if p_waiver_accepted is not true then
    select f.version, f.accepted_at
      into v_waiver_version, v_waiver_accepted_at
      from public.waiver_on_file(v_tenant_id, v_person_id) f;

    -- Nothing on file for the version in force, but the form says it showed
    -- one: the agreement was republished after the page rendered the summary.
    -- "Tick the box" would name a box they were never shown, so say what
    -- happened instead.
    if v_waiver_version is null
       and p_waiver_version is not null
       and exists (
         select 1 from public.legal_document_versions v
          where v.tenant_id = v_tenant_id
            and v.document = 'waiver'
            and v.version > p_waiver_version
       ) then
      raise exception 'WAIVER_CHANGED';
    end if;
  end if;

  -- Otherwise asked of a signed-in caller exactly as it is of an anonymous
  -- one. Holding an account is not agreement to anything: the waiver is about
  -- taking part, and a path around it would be the shortest way to a
  -- registration with no acceptance behind it.
  if v_waiver_version is null then
    v_waiver_version := public.accepted_waiver_version(
      v_tenant_id, p_waiver_accepted, p_waiver_version
    );

    if v_waiver_version is not null then
      v_waiver_accepted_at := now();
      -- On file from here on. A second acceptance of a version already there
      -- keeps the first date: that is when they first agreed to it.
      insert into public.person_waiver_acceptances (tenant_id, person_id, version, accepted_at)
      values (v_tenant_id, v_person_id, v_waiver_version, v_waiver_accepted_at)
      on conflict (tenant_id, person_id, version) do nothing;
    end if;
  end if;

  -- And the same question again, through the same resolver, for the reason it
  -- is shared: two paths that could disagree about consent would disagree
  -- silently, one recording permission the other would have declined (#599).
  v_photo := public.resolved_photo_consent(v_tenant_id, p_photo_consent);

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
     instagram_handle, pronouns, attended_before, waiver_accepted_at, waiver_version,
     party_includes_minor, accompanying_adult_name, accompanying_adult_phone,
     emergency_contact_name, emergency_contact_phone,
     photo_consent, photo_consent_at, photo_consent_text)
  values
    (v_tenant_id, p_event_id, v_person.display_name, v_person.email,
     nullif(btrim(coalesce(p_phone, '')), ''), p_party_size,
     nullif(btrim(coalesce(p_notes, '')), ''), v_person_id, v_handle, v_pronouns,
     p_attended_before, v_waiver_accepted_at, v_waiver_version,
     p_party_includes_minor, v_minor.accompanying_adult_name, v_minor.accompanying_adult_phone,
     v_minor.emergency_contact_name, v_minor.emergency_contact_phone,
     v_photo.consent, v_photo.consented_at, v_photo.consent_text)
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
    -- person_waiver_acceptances cannot: its insert is `on conflict do nothing`.
    raise exception 'ALREADY_REGISTERED';
end;
$$;

comment on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean) is
  'Registers the signed-in caller for a published public event under their own people row (#1165). Never matches or creates a person: the record is auth.uid() on the request host, so this path cannot produce a duplicate. Corrections travel on the registration and are not written back to people. Asks the same self-reported "been here before?" question the anonymous form does (#1259), the same minors question (#685), takes the same participant waiver where one is in force (#686) -- or reuses the caller''s acceptance of that version already on file, copying its version and date onto the registration, and puts a fresh acceptance on file (#1401) -- and records the same photo and media consent where a scope is written (#599).';
