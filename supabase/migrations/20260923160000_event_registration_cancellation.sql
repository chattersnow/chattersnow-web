-- #1418: cancelling an event registration, by staff and by the registrant.
--
-- Cancel, not delete. The row stays -- history, attended-before (#1259) and
-- claim-from-registration keep reading it -- and three columns say it no
-- longer holds a place:
--
--   cancelled_at          when; null is an active registration
--   cancelled_by          the auth user who did it, staff or registrant
--   cancellation_reason   not_attending | mistake | duplicate | other
--   cancellation_note     optional, staff only
--
-- A cancelled registration:
--
--   * frees its seats: both registration RPCs sum only active rows against
--     events.capacity;
--   * frees its option counts: apply_registration_option_counts(), the public
--     options view and my_registration_option_counts() sum only active rows
--     against a cap (#1407). The counts themselves are kept, so an undo puts
--     back exactly what was there;
--   * releases a discount code reserved for it (20260830020000) -- unless the
--     code was already sent, when the registrant has it and handing it to
--     somebody else would give one code to two people;
--   * cannot be checked in, and a checked-in registration cannot be
--     cancelled: a constraint, so the door and the cancel button cannot race;
--   * no longer blocks registering again: the one-per-person and
--     one-per-email indexes cover active rows only.
--
-- Staff cancel and undo through cancel_event_registration() and
-- restore_event_registration() (events: manage). An undo is refused where the
-- seats or an option's cap have been taken since, or where the same person
-- has registered again. The registrant cancels through
-- cancel_my_event_registration(), for their own registration only and only
-- before the event starts.
--
-- Hard delete is unchanged: the "event_registrations delete" policy
-- (events: manage) stays, and nothing in the application uses it.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

alter table public.event_registrations
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references auth.users (id) on delete set null,
  add column cancellation_reason text
    constraint event_registrations_cancellation_reason_check
      check (cancellation_reason in ('not_attending', 'mistake', 'duplicate', 'other')),
  add column cancellation_note text
    constraint event_registrations_cancellation_note_length
      check (char_length(cancellation_note) <= 500),
  add constraint event_registrations_cancellation_pair
    check ((cancelled_at is null) = (cancellation_reason is null)),
  add constraint event_registrations_cancellation_scope
    check (cancelled_at is not null or (cancelled_by is null and cancellation_note is null)),
  add constraint event_registrations_cancelled_not_checked_in
    check (cancelled_at is null or checked_in_at is null);

comment on column public.event_registrations.cancelled_at is
  'When this registration was cancelled (#1418). Null is active. A cancelled registration holds no seats, no option counts against a cap and no unsent discount code, and cannot be checked in. Written only by cancel_event_registration(), restore_event_registration() and cancel_my_event_registration().';
comment on column public.event_registrations.cancelled_by is
  'The auth user who cancelled this registration (#1418): a staff member, or the registrant themselves.';
comment on column public.event_registrations.cancellation_reason is
  'Why this registration was cancelled (#1418): not_attending, mistake, duplicate or other. Always not_attending when the registrant cancelled it.';
comment on column public.event_registrations.cancellation_note is
  'A staff member''s note on a cancellation (#1418). Optional.';

-- Column grants since 20260922040000: a column not named here is invisible to
-- the portal. Readable like checked_in_at, by the same events: view reader.
grant select (cancelled_at, cancelled_by, cancellation_reason, cancellation_note)
  on public.event_registrations to authenticated;

-- ---------------------------------------------------------------------------
-- 2. One active registration per person and per email
-- ---------------------------------------------------------------------------

-- Somebody who cancelled can register again. Nothing uses either index as an
-- ON CONFLICT target, so narrowing the predicate changes no caller.
drop index public.event_registrations_event_email_key;
create unique index event_registrations_event_email_key
  on public.event_registrations (event_id, lower(email))
  where email <> '' and cancelled_at is null;

drop index public.event_registrations_event_person_key;
create unique index event_registrations_event_person_key
  on public.event_registrations (event_id, person_id)
  where person_id is not null and cancelled_at is null;

-- ---------------------------------------------------------------------------
-- 3. Cancelling and undoing
-- ---------------------------------------------------------------------------

-- The one place a cancellation is written, so the staff and self-service
-- paths cannot disagree about what a cancellation releases.
create function public.apply_registration_cancellation(
  p_tenant_id uuid,
  p_registration_id uuid,
  p_reason text,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.event_registrations
     set cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancellation_reason = p_reason,
         cancellation_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_registration_id
     and tenant_id = p_tenant_id;

  -- A code nobody has been sent goes back to the pool. A sent one stays: the
  -- registrant has it, and reassigning it would put one code in two inboxes.
  update public.discount_codes
     set registration_id = null,
         assigned_at = null
   where registration_id = p_registration_id
     and tenant_id = p_tenant_id
     and sent_at is null;
end;
$$;

comment on function public.apply_registration_cancellation(uuid, uuid, text, text) is
  'Marks a registration cancelled and releases an unsent discount code reserved for it (#1418). Internal: called by cancel_event_registration() and cancel_my_event_registration(), which do the checks.';

revoke execute on function public.apply_registration_cancellation(uuid, uuid, text, text)
  from public, anon, authenticated;

create function public.cancel_event_registration(
  p_registration_id uuid,
  p_reason text,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_registration record;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to cancel registrations';
  end if;

  if p_reason is null or p_reason not in ('not_attending', 'mistake', 'duplicate', 'other') then
    raise exception 'CANCELLATION_REASON_INVALID';
  end if;

  if char_length(btrim(coalesce(p_note, ''))) > 500 then
    raise exception 'CANCELLATION_NOTE_TOO_LONG';
  end if;

  select cancelled_at, checked_in_at
    into v_registration
    from public.event_registrations
   where id = p_registration_id
     and tenant_id = v_tenant_id
     for update;

  if not found then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  if v_registration.cancelled_at is not null then
    raise exception 'REGISTRATION_ALREADY_CANCELLED';
  end if;

  if v_registration.checked_in_at is not null then
    raise exception 'REGISTRATION_CHECKED_IN';
  end if;

  perform public.apply_registration_cancellation(v_tenant_id, p_registration_id, p_reason, p_note);
end;
$$;

comment on function public.cancel_event_registration(uuid, text, text) is
  'Staff cancelling a registration (#1418). Requires events: manage. Refuses one already cancelled (REGISTRATION_ALREADY_CANCELLED) or checked in (REGISTRATION_CHECKED_IN -- undo the check-in first). Frees the seats and option counts and releases an unsent discount code.';

revoke execute on function public.cancel_event_registration(uuid, text, text) from public, anon;
grant execute on function public.cancel_event_registration(uuid, text, text) to authenticated;

create function public.restore_event_registration(
  p_registration_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_registration record;
  v_event record;
  v_taken bigint;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to restore registrations';
  end if;

  select r.event_id, r.party_size, r.cancelled_at
    into v_registration
    from public.event_registrations r
   where r.id = p_registration_id
     and r.tenant_id = v_tenant_id;

  if not found then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  if v_registration.cancelled_at is null then
    raise exception 'REGISTRATION_NOT_CANCELLED';
  end if;

  -- The lock the registration RPCs take, so an undo and a registration racing
  -- for the last seat queue behind each other.
  select capacity, auto_assign_discount_codes
    into v_event
    from public.events
   where id = v_registration.event_id
     and tenant_id = v_tenant_id
     for update;

  if v_event.capacity is not null then
    select coalesce(sum(party_size), 0) into v_taken
      from public.event_registrations
     where event_id = v_registration.event_id
       and cancelled_at is null;

    if v_taken + v_registration.party_size > v_event.capacity then
      raise exception 'EVENT_AT_CAPACITY';
    end if;
  end if;

  if exists (
    select 1
      from public.event_registration_option_counts mine
      join public.event_registration_options o
        on o.id = mine.option_id and o.tenant_id = mine.tenant_id
     where mine.registration_id = p_registration_id
       and o.cap is not null
       and mine.quantity + coalesce((
             select sum(c.quantity)
               from public.event_registration_option_counts c
               join public.event_registrations r on r.id = c.registration_id
              where c.option_id = o.id
                and r.cancelled_at is null
           ), 0) > o.cap
  ) then
    raise exception 'EVENT_OPTION_FULL';
  end if;

  update public.event_registrations
     set cancelled_at = null,
         cancelled_by = null,
         cancellation_reason = null,
         cancellation_note = null
   where id = p_registration_id
     and tenant_id = v_tenant_id;

  -- Its released code went back to the pool; a fresh one, where the event
  -- hands them out and it holds none.
  if v_event.auto_assign_discount_codes and not exists (
    select 1 from public.discount_codes where registration_id = p_registration_id
  ) then
    update public.discount_codes
       set registration_id = p_registration_id,
           assigned_at = now()
     where id = (
       select id
         from public.discount_codes
        where event_id = v_registration.event_id
          and tenant_id = v_tenant_id
          and registration_id is null
        order by created_at asc
        for update skip locked
        limit 1
     );
  end if;
exception
  when unique_violation then
    -- The same person or address registered again after this was cancelled.
    raise exception 'ALREADY_REGISTERED';
end;
$$;

comment on function public.restore_event_registration(uuid) is
  'Staff undoing a cancellation (#1418). Requires events: manage. Refused when the event''s capacity (EVENT_AT_CAPACITY) or an option''s cap (EVENT_OPTION_FULL) no longer has room, or when the person has registered again since (ALREADY_REGISTERED). Reserves a fresh discount code where the event hands them out.';

revoke execute on function public.restore_event_registration(uuid) from public, anon;
grant execute on function public.restore_event_registration(uuid) to authenticated;

create function public.cancel_my_event_registration(
  p_registration_id uuid
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

  select r.tenant_id, r.cancelled_at, r.checked_in_at, e.starts_at
    into v_registration
    from public.event_registrations r
    join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
   where r.id = p_registration_id
     and r.person_id = v_person_id
     for update of r;

  -- Somebody else's registration reads exactly like one that does not exist,
  -- as it does for my_photo_consent().
  if not found then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  if v_registration.cancelled_at is not null then
    raise exception 'REGISTRATION_ALREADY_CANCELLED';
  end if;

  if v_registration.checked_in_at is not null or v_registration.starts_at <= now() then
    raise exception 'EVENT_ALREADY_STARTED';
  end if;

  perform public.apply_registration_cancellation(
    v_registration.tenant_id, p_registration_id, 'not_attending', null
  );
end;
$$;

comment on function public.cancel_my_event_registration(uuid) is
  'The signed-in caller cancelling their own registration (#1418), matched through my_constituent_person_id(''events''), before the event starts (EVENT_ALREADY_STARTED). Recorded as not_attending. No undo on this path: registering again is.';

revoke execute on function public.cancel_my_event_registration(uuid) from public, anon;
grant execute on function public.cancel_my_event_registration(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. What counts: only active registrations
-- ---------------------------------------------------------------------------

-- The public form's "is this option full". `create or replace` restates the
-- view's options; the owner, grants and comment carry over.
create or replace view public.public_event_registration_options
with (security_barrier = true) as
select
  o.id,
  o.event_id,
  o.label,
  o.sort_order,
  e.registration_options_prompt as prompt,
  (o.cap is not null
   and coalesce((select sum(c.quantity) from public.event_registration_option_counts c
                  join public.event_registrations r on r.id = c.registration_id
                  where c.option_id = o.id and r.cancelled_at is null), 0) >= o.cap) as is_full
from public.event_registration_options o
join public.events e on e.id = o.event_id and e.tenant_id = o.tenant_id
where e.visibility = 'public'
  and e.status = 'published'
  and o.tenant_id = public.public_tenant_id();

-- The functions below are their current bodies unchanged but for the
-- #1418 lines. Signatures are unchanged except my_event_history(), which returns
-- one more column and so is dropped and recreated with its grant.

CREATE OR REPLACE FUNCTION public.register_for_event(p_event_id uuid, p_name text, p_email text, p_phone text, p_party_size integer, p_notes text, p_honeypot text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_instagram_handle text DEFAULT NULL::text, p_pronouns text DEFAULT NULL::text, p_attended_before boolean DEFAULT NULL::boolean, p_waiver_accepted boolean DEFAULT false, p_waiver_version integer DEFAULT NULL::integer, p_party_includes_minor boolean DEFAULT NULL::boolean, p_accompanying_adult_name text DEFAULT NULL::text, p_accompanying_adult_phone text DEFAULT NULL::text, p_emergency_contact_name text DEFAULT NULL::text, p_emergency_contact_phone text DEFAULT NULL::text, p_photo_consent boolean DEFAULT NULL::boolean, p_option_counts jsonb DEFAULT NULL::jsonb, p_riding_discipline text DEFAULT NULL::text, p_ski_experience_level text DEFAULT NULL::text, p_snowboard_experience_level text DEFAULT NULL::text, p_preferred_mountain text DEFAULT NULL::text, p_adults_only_confirmed boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event record;
  v_existing_party_size integer;
  v_registration_id uuid;
  v_person_id uuid;
  v_pronouns text := nullif(btrim(p_pronouns), '');
  v_tenant_id uuid := public.public_tenant_id();
  v_waiver_version integer;
  v_minor public.minor_accompaniment_contacts;
  v_photo public.photo_consent_record;
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

  select capacity, registration_enabled, registration_deadline, auto_assign_discount_codes, adults_only
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

  -- After the honeypot's early return, like the waiver below: a bot that
  -- trips the honeypot and sends an incomplete answer must get the same
  -- nothing a clean bot gets, or the honeypot becomes an oracle of its own.
  -- An UNANSWERED question is never refused here -- see the header.
  -- #1416. A tenant that does not ask has not been answered: null, the
  -- column's "nobody was asked", and no contacts -- whatever arrived.
  -- #1417. An 18+ event never asks the under-18 question, whatever the
  -- tenant setting says: the confirmation below is its answer.
  if v_event.adults_only or not public.tenant_asks_about_minors(v_tenant_id) then
    p_party_includes_minor := null;
  end if;

  -- #1417. After the honeypot, like the waiver: a bot learns nothing about
  -- the event from being refused. Only `true` confirms; an unanswered box is
  -- a refusal, not an unanswered question, because the event says adults
  -- only and a registration without the confirmation is one it never takes.
  if v_event.adults_only and p_adults_only_confirmed is not true then
    raise exception 'ADULTS_ONLY_CONFIRMATION_REQUIRED';
  end if;

  v_minor := public.resolve_minor_contacts(
    p_party_includes_minor,
    p_accompanying_adult_name,
    p_accompanying_adult_phone,
    p_emergency_contact_name,
    p_emergency_contact_phone
  );

  -- After the honeypot's early return, so a bot learns nothing about whether
  -- this organization takes a waiver, and before the capacity lock, so a
  -- refusal does not queue behind other registrations for a row it will never
  -- write.
  v_waiver_version := public.accepted_waiver_version(
    v_tenant_id, p_waiver_accepted, p_waiver_version
  );

  -- Beside the waiver, and it can refuse nothing: a decline is a valid
  -- registration. The snapshot is read from this tenant's own slot in here,
  -- so the words a registrant answered against cannot be supplied by whoever
  -- is posting the form (#599).
  v_photo := public.resolved_photo_consent(v_tenant_id, p_photo_consent);

  -- #1407. A capped option needs the lock below as much as a capped event,
  -- and it has to be taken here, before the insert: the insert's foreign key
  -- takes a share lock on the event row, and two registrations each holding
  -- one while waiting to update it would deadlock.
  if v_event.capacity is null and exists (
    select 1 from public.event_registration_options
     where event_id = p_event_id and tenant_id = v_tenant_id and cap is not null
  ) then
    perform 1 from public.events
     where id = p_event_id and tenant_id = v_tenant_id
     for update;
  end if;

  if v_event.capacity is not null then
    -- Take the event row before counting seats, so concurrent registrations
    -- queue behind each other and every one of them sums a table that already
    -- contains the ones ahead of it. Held until this transaction commits,
    -- which is what makes the check below binding rather than advisory. Only
    -- capped events pay for it; an uncapped event never reaches this branch.
    perform 1 from public.events
     where id = p_event_id and tenant_id = v_tenant_id
     for update;

    -- #1418. A cancelled registration holds no seats.
    select coalesce(sum(party_size), 0) into v_existing_party_size
    from public.event_registrations
    where event_id = p_event_id
      and cancelled_at is null;

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
  -- history is the check-in ledger. p_party_includes_minor is stored the same
  -- way and for the same reason, and the accompanying adult is likewise never
  -- written back: they are an arrangement for one event, not a directory
  -- record somebody asked us to keep. Photo consent is not written back
  -- either, and that one is a decision rather than an omission: an answer
  -- about one event's photographs is not a standing permission, and a
  -- `people` column saying "happy to be photographed" would be read as one.
  insert into public.event_registrations
    (tenant_id, event_id, name, email, phone, party_size, notes, person_id, instagram_handle, pronouns, attended_before,
     waiver_accepted_at, waiver_version,
     party_includes_minor, accompanying_adult_name, accompanying_adult_phone, emergency_contact_name, emergency_contact_phone,
     photo_consent, photo_consent_at, photo_consent_text,
     adults_only_confirmed_at)
  values
    (v_tenant_id, p_event_id, p_name, p_email, p_phone, p_party_size, p_notes, v_person_id, p_instagram_handle, v_pronouns, p_attended_before,
     case when v_waiver_version is null then null else now() end, v_waiver_version,
     p_party_includes_minor, v_minor.accompanying_adult_name, v_minor.accompanying_adult_phone,
     v_minor.emergency_contact_name, v_minor.emergency_contact_phone,
     v_photo.consent, v_photo.consented_at, v_photo.consent_text,
     case when v_event.adults_only then now() end)
  returning id into v_registration_id;

  -- #1407. After the insert, so the counts have a row to hang off; a refusal
  -- here rolls the registration back with it.
  perform public.apply_registration_option_counts(
    v_tenant_id, p_event_id, v_registration_id, p_party_size, p_option_counts, true, true
  );

  -- #1415. The riding answers, on the person and in this transaction: a
  -- refusal here rolls the registration back with it, and one that passes
  -- cannot leave a registration without the answers it was made with.
  perform public.apply_registration_rider_profile(
    v_tenant_id, v_person_id,
    p_riding_discipline, p_ski_experience_level, p_snowboard_experience_level, p_preferred_mountain
  );

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
$function$;

CREATE OR REPLACE FUNCTION public.register_myself_for_event(p_event_id uuid, p_party_size integer, p_notes text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_pronouns text DEFAULT NULL::text, p_instagram_handle text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_attended_before boolean DEFAULT NULL::boolean, p_waiver_accepted boolean DEFAULT false, p_waiver_version integer DEFAULT NULL::integer, p_party_includes_minor boolean DEFAULT NULL::boolean, p_accompanying_adult_name text DEFAULT NULL::text, p_accompanying_adult_phone text DEFAULT NULL::text, p_emergency_contact_name text DEFAULT NULL::text, p_emergency_contact_phone text DEFAULT NULL::text, p_photo_consent boolean DEFAULT NULL::boolean, p_option_counts jsonb DEFAULT NULL::jsonb, p_riding_discipline text DEFAULT NULL::text, p_ski_experience_level text DEFAULT NULL::text, p_snowboard_experience_level text DEFAULT NULL::text, p_preferred_mountain text DEFAULT NULL::text, p_adults_only_confirmed boolean DEFAULT NULL::boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  select capacity, registration_enabled, registration_deadline, auto_assign_discount_codes, adults_only
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
  -- #1416. A tenant that does not ask has not been answered: null, the
  -- column's "nobody was asked", and no contacts -- whatever arrived.
  -- #1417. An 18+ event never asks the under-18 question, whatever the
  -- tenant setting says: the confirmation below is its answer.
  if v_event.adults_only or not public.tenant_asks_about_minors(v_tenant_id) then
    p_party_includes_minor := null;
  end if;

  -- #1417. After the honeypot, like the waiver: a bot learns nothing about
  -- the event from being refused. Only `true` confirms; an unanswered box is
  -- a refusal, not an unanswered question, because the event says adults
  -- only and a registration without the confirmation is one it never takes.
  if v_event.adults_only and p_adults_only_confirmed is not true then
    raise exception 'ADULTS_ONLY_CONFIRMATION_REQUIRED';
  end if;

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

  -- #1407, and before the insert for the reason register_for_event() gives.
  if v_event.capacity is null and exists (
    select 1 from public.event_registration_options
     where event_id = p_event_id and tenant_id = v_tenant_id and cap is not null
  ) then
    perform 1 from public.events
     where id = p_event_id and tenant_id = v_tenant_id
     for update;
  end if;

  if v_event.capacity is not null then
    -- The same lock register_for_event() takes (20260907130000): hold the
    -- event row before summing seats, so concurrent registrations queue and
    -- each one counts a table that already holds the ones ahead of it. The two
    -- functions taking the same lock on the same row is what makes the check
    -- binding across *both* paths rather than only within each.
    perform 1 from public.events
     where id = p_event_id and tenant_id = v_tenant_id
     for update;

    -- #1418. A cancelled registration holds no seats.
    select coalesce(sum(party_size), 0) into v_existing_party_size
    from public.event_registrations
    where event_id = p_event_id
      and cancelled_at is null;

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
     photo_consent, photo_consent_at, photo_consent_text,
     adults_only_confirmed_at)
  values
    (v_tenant_id, p_event_id, v_person.display_name, v_person.email,
     nullif(btrim(coalesce(p_phone, '')), ''), p_party_size,
     nullif(btrim(coalesce(p_notes, '')), ''), v_person_id, v_handle, v_pronouns,
     p_attended_before, v_waiver_accepted_at, v_waiver_version,
     p_party_includes_minor, v_minor.accompanying_adult_name, v_minor.accompanying_adult_phone,
     v_minor.emergency_contact_name, v_minor.emergency_contact_phone,
     v_photo.consent, v_photo.consented_at, v_photo.consent_text,
     case when v_event.adults_only then now() end)
  returning id into v_registration_id;

  -- #1407, as on the anonymous path and through the same function.
  perform public.apply_registration_option_counts(
    v_tenant_id, p_event_id, v_registration_id, p_party_size, p_option_counts, true, true
  );

  -- #1415. The riding answers, on the person and in this transaction: a
  -- refusal here rolls the registration back with it, and one that passes
  -- cannot leave a registration without the answers it was made with.
  perform public.apply_registration_rider_profile(
    v_tenant_id, v_person_id,
    p_riding_discipline, p_ski_experience_level, p_snowboard_experience_level, p_preferred_mountain
  );

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
$function$;

CREATE OR REPLACE FUNCTION public.apply_registration_option_counts(p_tenant_id uuid, p_event_id uuid, p_registration_id uuid, p_party_size integer, p_counts jsonb, p_required boolean, p_enforce_caps boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_has_options boolean;
  v_answered boolean;
  v_total bigint;
  v_full_label text;
begin
  select exists (
    select 1 from public.event_registration_options
     where event_id = p_event_id and tenant_id = p_tenant_id
  ) into v_has_options;

  v_answered := p_counts is not null
    and jsonb_typeof(p_counts) <> 'null'
    and p_counts <> '{}'::jsonb;

  if not v_answered then
    if v_has_options and p_required then
      raise exception 'EVENT_OPTIONS_REQUIRED';
    end if;
    delete from public.event_registration_option_counts
     where registration_id = p_registration_id and tenant_id = p_tenant_id;
    return;
  end if;

  if jsonb_typeof(p_counts) <> 'object' or not v_has_options then
    raise exception 'EVENT_OPTIONS_INVALID';
  end if;

  -- Every key an option of this event, every value a whole number >= 0.
  -- Compared as text so a malformed key is a refusal rather than a cast error.
  if exists (
    select 1
      from jsonb_each(p_counts) as e(key, value)
      left join public.event_registration_options o
        on o.id::text = lower(e.key)
       and o.event_id = p_event_id
       and o.tenant_id = p_tenant_id
     where o.id is null
        -- A CASE, not an OR chain: SQL does not promise to test the type
        -- before attempting the cast.
        or case when jsonb_typeof(e.value) = 'number'
                then (e.value::text)::numeric not between 0 and 10000
                     or (e.value::text)::numeric <> trunc((e.value::text)::numeric)
                else true
           end
  ) then
    raise exception 'EVENT_OPTIONS_INVALID';
  end if;

  select coalesce(sum((e.value::text)::numeric), 0)
    into v_total
    from jsonb_each(p_counts) as e(key, value);

  if v_total <> p_party_size then
    raise exception 'EVENT_OPTIONS_MISMATCH';
  end if;

  if p_enforce_caps and exists (
    select 1 from public.event_registration_options o
     where o.event_id = p_event_id and o.tenant_id = p_tenant_id and o.cap is not null
  ) then
    -- The capacity check's lock, taken here too: concurrent registrations
    -- queue, and each one sums counts that include the ones ahead of it.
    -- The registration RPCs already hold it by now -- they must take it
    -- before inserting (see there) -- so this acquires it only for the
    -- set_my_ path, which inserts no registration first.
    perform 1 from public.events
     where id = p_event_id and tenant_id = p_tenant_id
     for update;

    -- Only an INCREASE is refused. A registration keeping what it already
    -- holds -- editing another option, or an option staff took past its cap
    -- -- is not a new claim on the cap.
    select o.label into v_full_label
      from jsonb_each(p_counts) as e(key, value)
      join public.event_registration_options o
        on o.id::text = lower(e.key) and o.event_id = p_event_id and o.tenant_id = p_tenant_id
     where o.cap is not null
       and (e.value::text)::numeric::integer > coalesce((
             select c.quantity from public.event_registration_option_counts c
              where c.registration_id = p_registration_id and c.option_id = o.id
           ), 0)
       -- #1418. Only active registrations hold a cap.
       and coalesce((
             select sum(c.quantity) from public.event_registration_option_counts c
               join public.event_registrations r on r.id = c.registration_id
              where c.option_id = o.id and c.registration_id <> p_registration_id
                and r.cancelled_at is null
           ), 0) + (e.value::text)::numeric::integer > o.cap
     order by o.sort_order
     limit 1;

    if v_full_label is not null then
      raise exception 'EVENT_OPTION_FULL';
    end if;
  end if;

  delete from public.event_registration_option_counts
   where registration_id = p_registration_id and tenant_id = p_tenant_id;

  insert into public.event_registration_option_counts
    (tenant_id, registration_id, option_id, label, sort_order, quantity)
  select p_tenant_id, p_registration_id, o.id, o.label, o.sort_order, (e.value::text)::numeric::integer
    from jsonb_each(p_counts) as e(key, value)
    join public.event_registration_options o
      on o.id::text = lower(e.key) and o.event_id = p_event_id and o.tenant_id = p_tenant_id
   where (e.value::text)::numeric::integer > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_registration_option_counts(p_registration_id uuid)
 RETURNS TABLE(option_id uuid, label text, prompt text, quantity integer, available integer, party_size integer, editable boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    o.id,
    o.label,
    e.registration_options_prompt,
    coalesce(mine.quantity, 0),
    case when o.cap is null then null
         else greatest(o.cap - coalesce((
           select sum(c.quantity) from public.event_registration_option_counts c
             join public.event_registrations other on other.id = c.registration_id
            where c.option_id = o.id and c.registration_id <> r.id
              and other.cancelled_at is null
         ), 0), 0)::integer
    end,
    r.party_size,
    r.cancelled_at is null
      and e.registration_enabled
      and (e.registration_deadline is null or e.registration_deadline >= now())
  from public.event_registrations r
  join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
  join public.event_registration_options o on o.event_id = e.id and o.tenant_id = e.tenant_id
  left join public.event_registration_option_counts mine
    on mine.registration_id = r.id and mine.option_id = o.id
  where r.id = p_registration_id
    and r.person_id = public.my_constituent_person_id('events')
  order by o.sort_order, o.label;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_registration_option_counts(p_registration_id uuid, p_counts jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_person_id uuid := public.my_constituent_person_id('events');
  v_registration record;
begin
  if v_person_id is null then
    raise exception 'NO_RECORD';
  end if;

  select r.tenant_id, r.event_id, r.party_size, r.cancelled_at, e.registration_enabled, e.registration_deadline
    into v_registration
    from public.event_registrations r
    join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
   where r.id = p_registration_id
     and r.person_id = v_person_id;

  if not found then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  -- #1418
  if v_registration.cancelled_at is not null then
    raise exception 'REGISTRATION_CANCELLED';
  end if;

  if not v_registration.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if v_registration.registration_deadline is not null and v_registration.registration_deadline < now() then
    raise exception 'REGISTRATION_DEADLINE_PASSED';
  end if;

  perform public.apply_registration_option_counts(
    v_registration.tenant_id, v_registration.event_id, p_registration_id,
    v_registration.party_size, p_counts, true, true
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.my_event_registration(p_event_id uuid)
 RETURNS TABLE(registration_id uuid, party_size integer, notes text, registered_at timestamp with time zone, checked_in_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r.party_size, r.notes, r.created_at, r.checked_in_at
    from public.event_registrations r
   where r.event_id = p_event_id
     and r.person_id = public.my_constituent_person_id('events')
     -- #1418. A cancelled registration is no longer "you're registered".
     and r.cancelled_at is null
   limit 1;
$function$;

drop function public.my_event_history();

CREATE FUNCTION public.my_event_history()
 RETURNS TABLE(registration_id uuid, event_id uuid, event_name text, starts_at timestamp with time zone, ends_at timestamp with time zone, timezone text, location text, party_size integer, attended boolean, registered_at timestamp with time zone, cancelled_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id,
         e.id,
         e.name,
         e.starts_at,
         e.ends_at,
         e.timezone,
         e.location,
         r.party_size,
         r.checked_in_at is not null,
         r.created_at,
         r.cancelled_at
    from public.event_registrations r
    join public.events e on e.id = r.event_id
   where r.person_id = public.my_history_person_id('events')
   order by e.starts_at desc, r.created_at desc;
$function$;

comment on function public.my_event_history() is
  'The caller''s own event registrations (#1163), cancelled ones included with when (#1418). Takes no arguments: the person is auth.uid() on the request host, so there is nothing to ask for but your own.';

revoke execute on function public.my_event_history() from public, anon;
grant execute on function public.my_event_history() to authenticated;

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
      select jsonb_agg(jsonb_build_object('quantity', quantity, 'event_id', event_id))
      from public.inventory_movements
      where event_id = any(v_event_ids) and movement_type = 'distributed'
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

-- ---------------------------------------------------------------------------
-- 5. Retention
-- ---------------------------------------------------------------------------

-- A staff note on a cancellation is free text like `notes`, and goes with it
-- when a registration is anonymized. The reason and the dates stay: they
-- describe the registration, not the person.
CREATE OR REPLACE FUNCTION public.run_retention_purge(p_dry_run boolean DEFAULT true, p_as_of timestamp with time zone DEFAULT now(), p_trigger text DEFAULT 'cron'::text, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid;
  v_run_id uuid;
  v_result_run_id uuid;
  v_ids uuid[];
  v_person_ids uuid[];
  v_failed boolean := false;
  v_period interval;
  v_secondary interval;
  v_mode text;
  v_enforce boolean;
  -- Rule N's three values, computed once above the loop and logged inside it.
  v_account_ids uuid[] := '{}';
  v_account_enforce boolean := false;
  v_account_error text;
begin
  -- A manual dry run from the portal must not interleave with the nightly job.
  -- Transaction-scoped, so it releases on commit or rollback either way.
  if not pg_try_advisory_xact_lock(hashtext('retention_purge')) then
    return null;
  end if;

  -- Rule H, once for the sweep rather than once per tenant. rate_limit_hits is
  -- keyed by IP and route and has no tenant_id, so there is nothing to scope --
  -- but its policy row is per-tenant now, and purge_rate_limit_hits() takes the
  -- strictest clock any tenant has set. Each tenant's run still logs the rule,
  -- inside the loop, so the Data Retention page explains it as before.
  if not p_dry_run then
    perform public.purge_rate_limit_hits(p_as_of);
  end if;

  -- N, part one (#1296). Website accounts, decided and applied once for the
  -- whole platform rather than once per tenant.
  --
  -- The second rule with nothing to scope, for a stronger reason than rule H's:
  -- an account has no tenant until a claim is approved. Somebody signs up at
  -- /my against whichever host they were on and nothing records which --
  -- deliberately, because #1161 resolves a constituent's tenant from the
  -- request rather than from a membership. There is no tenant whose sweep owns
  -- the row.
  --
  -- Two consequences, both the conservative direction:
  --
  --   * the clock is the SHORTEST any tenant has set, as rule H's is. An
  --     account belongs to a person rather than to an organization, so no
  --     tenant's choice may extend how long another's sign-up is held.
  --   * it enforces only where EVERY active tenant has the rule enforcing. One
  --     organization that has not agreed to the period is a veto, because the
  --     row it would remove is as much the next organization's as its own. A
  --     tenant with no row at all reads as 'off' and vetoes too.
  --
  -- The candidate list is read whatever the modes say, so a dry run reports
  -- real counts. It is read here rather than after the loop, so rules L and M
  -- below have not yet dropped this run's expired claims: an account those
  -- deletions free is deleted by the next night's run, not this one. The same
  -- conservatism rule D2 records, and for the same reason -- reporting the
  -- accounts that are already free is checkable, and simulating the ones a
  -- later rule in the same run would free is not.
  --
  -- In its own exception block, unlike rule H's call, which is bare: this one
  -- deletes from auth.users, where a reference the walk cannot see (an
  -- extension's table, storage.objects.owner) raises 23503. The sweep has to
  -- survive that and report it, which is what v_account_error carries into
  -- every tenant's run below.
  begin
    select min(period) into v_period
      from public.retention_policies where policy_key = 'constituent_accounts';

    if v_period is not null then
      v_account_ids := public.retention_unclaimed_account_ids(p_as_of - v_period);

      v_account_enforce := not p_dry_run and not exists (
        select 1
          from public.tenants t
          left join public.retention_policies p
            on p.tenant_id = t.id and p.policy_key = 'constituent_accounts'
         where t.status = 'active'
           and coalesce(p.mode, 'off') <> 'enforce'
      );

      if v_account_enforce and array_length(v_account_ids, 1) is not null then
        delete from auth.users where id = any(v_account_ids);
      end if;
    end if;
  exception when others then
    v_account_error := sqlerrm;
    v_account_ids := '{}';
  end;

  for v_tenant in
    select t.id
      from public.tenants t
     where t.status = 'active'
       and (p_tenant_id is null or t.id = p_tenant_id)
     order by t.created_at
  loop
    v_failed := false;

    insert into public.retention_runs (tenant_id, as_of, dry_run, trigger, triggered_by, status)
    values (v_tenant, p_as_of, p_dry_run, p_trigger, auth.uid(), 'running')
    returning id into v_run_id;

    if v_tenant = p_tenant_id then
      v_result_run_id := v_run_id;
    end if;

    -- Each rule gets its own exception block. A plpgsql exception block is a
    -- subtransaction, so a rule that fails rolls back only itself and the run
    -- finishes as 'partial' with the error recorded against that rule -- rather
    -- than one bad clock discarding the work of the other eight.

    -- H. Abuse-protection records. Not mode-gated; see purge_rate_limit_hits.
    --
    -- The only rule with no tenant dimension: rate_limit_hits is keyed by IP and
    -- route, has no tenant_id, and is correctly global (20260906010000 lists it
    -- among the twelve tables that stay platform-wide). The sweep therefore runs
    -- the purge once, above the loop, and each tenant's run logs the rule so the
    -- page still explains it rather than appearing to have skipped it.
    begin
      perform public.retention_log(v_run_id, 'rate_limit_hits', 'rate_limit_hits',
        case when p_dry_run then 'skipped' else 'deleted' end, '{}');
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rate_limit_hits', 'rate_limit_hits', 'skipped', sqlerrm);
    end;

    -- A. Contact form messages. The one table here that is safe to delete
    -- outright: nothing has a foreign key to it and it carries no audit trigger.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'contact_messages' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'skipped', '{}');
      else
        v_ids := array(
          select id from public.contact_messages
           where tenant_id = v_tenant and created_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.contact_messages where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'contact_messages', 'contact_messages', 'skipped', sqlerrm);
    end;

    -- C. Event registrations: strip the person, keep the row.
    --
    -- name and email are NOT NULL (20260823090000), so they take sentinels rather
    -- than nulls. '' is the established "no email" value -- both unique indexes
    -- here are partial (WHERE email <> '', WHERE person_id IS NOT NULL, see
    -- 20260901010000), which is exactly what makes anonymizing many rows of one
    -- event safe. party_size, checked_in_at, the three *_at_event snapshot
    -- columns, the waiver pair and party_includes_minor survive untouched: they
    -- are the impact figures and the acts this rule exists to preserve.
    --
    -- The four accompanying-adult and emergency contacts go with the personal
    -- fields (#685). One of them is the only personal data this product holds
    -- about somebody who never visited the site, and holding an emergency
    -- contact's number three years after the event is over describes nothing.
    -- They join the selector as well as the update: a row whose only remaining
    -- personal data was an emergency contact would otherwise never be picked up
    -- again. The column constraint is one-directional for exactly this update --
    -- the flag stays true while the contacts go null, which it allows.
    --
    -- The three photo-consent columns go with them (#599), and that is the
    -- OPPOSITE call from the waiver pair two paragraphs up. Both are records of
    -- something somebody said, so the difference is what they are about. An
    -- acceptance is a fact about an ACT -- this person agreed to these terms on
    -- this date -- and it stands on its own; #686 kept it for that reason. Photo
    -- consent is a fact about a person's FACE, and it is worthless the moment
    -- the row cannot be tied to one: an anonymized "declined" protects nobody,
    -- because there is no name to match against a photograph, and an anonymized
    -- "granted" authorizes nothing. So all three go beside the name, the email
    -- and the person_id, and `photo_consent is not null` joins the selector for
    -- the same reason the contacts do.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'event_registrations' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'skipped', '{}');
      else
        v_ids := array(
          select r.id
            from public.event_registrations r
            join public.events e on e.id = r.event_id
           where r.tenant_id = v_tenant
             and coalesce(e.ends_at, e.starts_at) < p_as_of - v_period
             and (r.name <> 'Removed' or r.person_id is not null
                  or r.phone is not null or r.notes is not null
                  or r.instagram_handle is not null or r.pronouns is not null
                  or r.accompanying_adult_name is not null
                  or r.accompanying_adult_phone is not null
                  or r.emergency_contact_name is not null
                  or r.emergency_contact_phone is not null
                  or r.photo_consent is not null)
        );
        perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.event_registrations
             set name = 'Removed',
                 email = '',
                 phone = null,
                 notes = null,
                 -- #1418. A staff note on a cancellation can name somebody.
                 cancellation_note = null,
                 instagram_handle = null,
                 pronouns = null,
                 person_id = null,
                 accompanying_adult_name = null,
                 accompanying_adult_phone = null,
                 emergency_contact_name = null,
                 emergency_contact_phone = null,
                 photo_consent = null,
                 photo_consent_at = null,
                 photo_consent_text = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'event_registrations', 'event_registrations', 'skipped', sqlerrm);
    end;

    -- B. Volunteer applications. Two clocks: the published policy is "2 years
    -- after your last activity with us, or 1 year if the application is withdrawn
    -- or declined". There is no 'withdrawn' status in the check constraint
    -- (20260827000000) -- 'declined' and 'closed' are the states that mean it,
    -- and status is what selects the clock.
    --
    -- The main clock reads person_last_activity_at, not just the row's
    -- updated_at, so a 'placed' application belonging to a volunteer who is still
    -- turning up does not expire merely because nobody has edited the record.
    begin
      select period, secondary_period, mode into v_period, v_secondary, v_mode
        from public.retention_policies
         where policy_key = 'volunteer_applications' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.volunteer_applications a
           where a.tenant_id = v_tenant
             and case
                   when a.status in ('declined', 'closed')
                     then a.updated_at < p_as_of - v_secondary
                   else greatest(a.updated_at,
                                 public.person_last_activity_at(a.person_id))
                          < p_as_of - v_period
                 end
        );
        perform public.retention_log(v_run_id, 'volunteer_applications', 'volunteer_applications', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.volunteer_applications where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', sqlerrm);
    end;

    -- E. Gear requests. The movement row is inventory history and stays; only the
    -- requester goes -- the link, and now the free text they wrote on the request
    -- form, which #721 moved off people.notes and onto the movement. Their name,
    -- email and phone are still not on the movement -- request_gear_items() puts
    -- those on a people row via resolve_or_create_person_by_email() -- so
    -- unlinking here is what lets the person rule below reach them.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'gear_requests' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.inventory_movements m
           where m.tenant_id = v_tenant
             and m.recipient_person_id is not null
             and m.movement_type in ('reserved', 'distributed')
             and m.occurred_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.inventory_movements set recipient_person_id = null, notes = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'gear_requests', 'inventory_movements', 'skipped', sqlerrm);
    end;

    -- E2. Gear request headers (#1032). The delivery method, the postage quote
    -- and the status are inventory history and stay; the requester link, the
    -- shipping address, the payment preference and the request notes go on the
    -- same clock as the movements above. Measured from the handover -- the
    -- fulfilment, else the cancellation, else the request itself.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'gear_requests' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'gear_requests', 'gear_requests', 'skipped', '{}');
      else
        v_ids := array(
          select r.id
            from public.gear_requests r
           where r.tenant_id = v_tenant
             and (r.person_id is not null
                  or r.ship_line1 is not null
                  or r.payment_method is not null
                  or r.notes is not null)
             and coalesce(r.fulfilled_at, r.cancelled_at, r.created_at) < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'gear_requests', 'gear_requests', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.gear_requests
             set person_id = null,
                 ship_name = null,
                 ship_line1 = null,
                 ship_line2 = null,
                 ship_city = null,
                 ship_region = null,
                 ship_postal_code = null,
                 ship_country = null,
                 payment_method = null,
                 notes = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'gear_requests', 'gear_requests', 'skipped', sqlerrm);
    end;

    -- D1. Rider profiles, and the backfill that has to come first.
    --
    -- The impact RPCs read coalesce(registration.*_at_event, the live people row)
    -- (20260904140000), and the snapshot trigger only stamps on the check-in
    -- transition (20260904120000). So any registration checked in before that
    -- migration, or whose person had no profile at the time, still resolves
    -- through people. Clearing the person's rider columns without stamping the
    -- snapshot first would silently change beginner counts on events that closed
    -- years ago. Backfill, then clear, in that order, in one transaction.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'rider_profiles' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
           where p.tenant_id = v_tenant
             and p.riding_discipline is not null
             and public.person_last_activity_at(p.id) < p_as_of - v_period
        );

        v_ids := array(
          select r.id
            from public.event_registrations r
            join public.people p on p.id = r.person_id
           where r.tenant_id = v_tenant
             and r.checked_in_at is not null
             and r.riding_discipline_at_event is null
             and p.riding_discipline is not null
             and p.id = any(v_person_ids)
        );
        perform public.retention_log(v_run_id, 'rider_profiles', 'event_registrations', 'backfilled', v_ids);

        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.event_registrations r
             set riding_discipline_at_event = p.riding_discipline,
                 ski_experience_level_at_event = p.ski_experience_level,
                 snowboard_experience_level_at_event = p.snowboard_experience_level
            from public.people p
           where p.id = r.person_id
             and r.tenant_id = v_tenant
             and r.checked_in_at is not null
             and r.riding_discipline_at_event is null
             and p.riding_discipline is not null
             and p.id = any(v_person_ids);
        end if;

        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'cleared', v_person_ids);

        -- All four columns in one statement: people_ski_level_requires_ski and
        -- people_snowboard_level_requires_snowboard (20260901050000) fire if a
        -- level outlives its discipline, which is why merge_people() handles them
        -- as a group too.
        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.people
             set riding_discipline = null,
                 ski_experience_level = null,
                 snowboard_experience_level = null,
                 preferred_mountain = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
    end;

    -- D2. Anonymize the person, when nothing else needs them.
    --
    -- Runs last of the person rules on purpose: retention_person_is_retained()
    -- has to observe the state after C, B and E dropped their references. In a
    -- dry run those references are still there, so this count is conservative --
    -- it reports the people who are *already* free, not the ones the same run
    -- would free. Say so on the page rather than trying to simulate it.
    --
    -- The row is never deleted. ~40 foreign keys point at people, nearly all
    -- NO ACTION, so a delete would fail for anyone with any history; is_anonymous
    -- is how this schema has always expressed "a person we keep no details for"
    -- (the donor_identified_or_anonymous check permits a null name only then, and
    -- people_email_key excludes anonymized rows from the unique index).
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'rider_profiles' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
           where p.tenant_id = v_tenant
             and p.auth_user_id is null
             and not p.is_anonymous
             and public.person_last_activity_at(p.id) < p_as_of - v_period
             and not public.retention_person_is_retained(p.id)
        );
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'anonymized', v_person_ids);
        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.people
             set is_anonymous = true,
                 name = null,
                 preferred_name = null,
                 email = null,
                 phone = null,
                 instagram_handle = null,
                 pronouns = null,
                 notes = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
    end;

    -- F. Portal accounts.
    --
    -- auth.users is never touched. audit_log.actor_id references it with no ON
    -- DELETE, as do ~120 other created_by/updated_by columns across the schema, so
    -- deleting an account that ever wrote a row raises 23503 -- and the audit
    -- trail is retained separately for governance, security, audit, insurance and
    -- legal purposes anyway. What this rule does is clear the personal details on
    -- the linked people row and remove any role grant that outlived the
    -- deactivation. /privacy is worded to match (see the same PR).
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'portal_accounts' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
            join public.deactivated_users d on d.user_id = p.auth_user_id
           where p.tenant_id = v_tenant
             and d.deactivated_at < p_as_of - v_period
             and not p.is_anonymous
        );
        perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'anonymized', v_person_ids);
        if v_enforce and array_length(v_person_ids, 1) is not null then
          -- tenant_id, not just the user id. deactivated_users is platform-wide
          -- (20260906010000 keeps it global: one row per auth account), so the
          -- unscoped form deleted that account's roles in every tenant it belonged
          -- to -- the one place the purge wrote outside the tenant it was sweeping.
          delete from public.user_roles
           where tenant_id = v_tenant
             and user_id in (
               select p.auth_user_id from public.people p where p.id = any(v_person_ids)
             );
          update public.people
             set is_anonymous = true,
                 name = null,
                 preferred_name = null,
                 email = null,
                 phone = null,
                 instagram_handle = null,
                 pronouns = null,
                 notes = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'portal_accounts', 'people', 'skipped', sqlerrm);
    end;

    -- G. Unclaimed portal invitations. pending_role_grants holds an email address
    -- and its own header (20260824060000) says there is no cleanup job; this is
    -- that job. Note the residual: the table is audited, so the delete writes the
    -- email into audit_log.old_data, which has no clock of its own. That is a real
    -- if smaller exposure than leaving the live row, and is tracked separately.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'pending_role_grants' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', '{}');
      else
        v_ids := array(
          select g.id
            from public.pending_role_grants g
           where g.tenant_id = v_tenant
             and ((g.status in ('claimed', 'revoked') and g.created_at < p_as_of - v_period)
              or (g.status = 'pending' and g.expires_at < p_as_of - v_period))
        );
        perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.pending_role_grants where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', sqlerrm);
    end;

    -- I. Audit trail snapshots (#720). Redaction, not deletion.
    --
    -- Runs after every rule above on purpose: A, C, E and G have just written
    -- this tenant's old values into audit_log.old_data, and the entries they
    -- wrote tonight are the ones a reader would most expect to find scrubbed
    -- seven years from now. Order does not matter for correctness -- the clock
    -- is the entry's own occurred_at -- but it is the order the rules read in.
    --
    -- Only entries that still hold something are counted or touched: a snapshot
    -- whose registered keys are all jsonb null already is finished, and without
    -- that test it would be rewritten and re-reported every night forever.
    --
    -- Null tenant_id means an audit entry for one of the global tables
    -- (deactivated_users, retention_policies, tenants ...). Those belong to the
    -- platform tenant, which is how 20260906160000 backfilled the historical
    -- ones, so the oldest tenant's run is what sweeps them -- rather than their
    -- being visible to every tenant's admin and swept by none.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'audit_log_snapshots' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'audit_log_snapshots', 'audit_log', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.audit_log a
           where (a.tenant_id = v_tenant
                  or (a.tenant_id is null
                      and v_tenant = (select t.id from public.tenants t
                                       order by t.created_at limit 1)))
             and a.redacted_at is null
             and a.occurred_at < p_as_of - v_period
             and public.retention_snapshot_has_personal_data(a.table_name, a.old_data, a.new_data)
        );
        perform public.retention_log(v_run_id, 'audit_log_snapshots', 'audit_log', 'redacted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.audit_log a
             set old_data = public.retention_redact_snapshot(a.table_name, a.old_data),
                 new_data = public.retention_redact_snapshot(a.table_name, a.new_data),
                 redacted_at = now()
           where a.id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'audit_log_snapshots', 'audit_log', 'skipped', sqlerrm);
    end;

    -- J. Merge snapshots (#720). Same treatment, one clock later in the record's
    -- life: person_merges holds two whole people rows, and the registered people
    -- columns are the same eleven rules D1 and D2 clear on a live person. The
    -- merge itself -- who merged whom, when, and the counts of what moved -- is
    -- untouched, which is what the table exists for.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_merge_snapshots' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_merge_snapshots', 'person_merges', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.person_merges m
           where m.tenant_id = v_tenant
             and m.redacted_at is null
             and m.merged_at < p_as_of - v_period
             and public.retention_snapshot_has_personal_data('people', m.merged_snapshot, m.survivor_before)
        );
        perform public.retention_log(v_run_id, 'person_merge_snapshots', 'person_merges', 'redacted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.person_merges m
             set merged_snapshot = public.retention_redact_snapshot('people', m.merged_snapshot),
                 survivor_before = public.retention_redact_snapshot('people', m.survivor_before),
                 redacted_at = now()
           where m.id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_merge_snapshots', 'person_merges', 'skipped', sqlerrm);
    end;

    -- K. Staff messages and resent receipts (#1203). What survives is the fact
    -- of the send -- when, by whom, about which record, and whether it was
    -- delivered; what goes is the correspondence itself and everyone named in
    -- it. Cleared rather than deleted, for the same reason rule E2 keeps the
    -- gear request: the detail view says "three messages went out about this
    -- request" long after it may say what any of them were.
    --
    -- to_email, subject and body are not null, so they take the empty-string
    -- sentinel rule C uses rather than the constraints being dropped.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'outbound_messages' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'outbound_messages', 'outbound_messages', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.outbound_messages m
           where m.tenant_id = v_tenant
             and (m.person_id is not null or m.to_email <> ''
                  or m.subject <> '' or m.body <> '')
             and m.created_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'outbound_messages', 'outbound_messages', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.outbound_messages
             set person_id = null, to_email = '', subject = '', body = ''
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'outbound_messages', 'outbound_messages', 'skipped', sqlerrm);
    end;

    -- L. Record claims (#1296). What somebody typed to persuade us a record
    -- is theirs -- a name, usually an address or a phone number, sometimes a
    -- note -- which a refused claim leaves us holding about a person who is
    -- not the person in the record.
    --
    -- Deleted rather than cleared, like the volunteer application it most
    -- resembles: person_claims is audited, so the decision itself (approved or
    -- refused, by whom, when) survives in audit_log on its own clock, and
    -- nothing reports on a claim.
    --
    -- This rule has no audit-log residual, unlike rule G's. Every stated_*
    -- column and both notes are in audited_tables.redacted_columns
    -- (20260916060000), so the trigger strips them before recording -- the
    -- write-time half of the two mechanisms in docs/spec/audit.md. The delete
    -- therefore leaves no copy of what the claimant typed anywhere.
    --
    -- updated_at carries both questions the decision record asks on one clock.
    -- It is the moment of the decision for a claim somebody decided, and --
    -- defaulted to created_at and maintained by set_updated_at, which no
    -- client can backdate -- the moment it was sent for one nobody did.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_claims' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_claims', 'person_claims', 'skipped', '{}');
      else
        v_ids := array(
          select c.id
            from public.person_claims c
           where c.tenant_id = v_tenant
             and c.updated_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'person_claims', 'person_claims', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.person_claims where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_claims', 'person_claims', 'skipped', sqlerrm);
    end;

    -- M. Hours a volunteer logged themselves (#1296, #1165).
    --
    -- Only the entries that became nothing. A confirmed submission is the
    -- provenance of a volunteer_hours row -- the record that the volunteer
    -- entered those hours rather than a staffer entering them on their behalf
    -- -- so deleting it on a clock of its own would leave the ledger asserting
    -- something with nothing behind it. `status <> 'confirmed'` is therefore
    -- the predicate, not an age on every row; a confirmed entry whose ledger
    -- row was later deleted (the reference is on delete set null) stays too,
    -- because what it evidences is unchanged.
    --
    -- No audit-log residual here either: `notes` and `review_note` are in this
    -- table's redacted_columns (20260916090000), so the free text a volunteer
    -- wrote was never recorded in a snapshot to begin with.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'volunteer_hour_submissions' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'skipped', '{}');
      else
        v_ids := array(
          select s.id
            from public.volunteer_hour_submissions s
           where s.tenant_id = v_tenant
             and s.status <> 'confirmed'
             and s.updated_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.volunteer_hour_submissions where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'skipped', sqlerrm);
    end;

    -- N, part two. The log line for the website-account rule, written once per
    -- tenant's run -- rule H's shape, and for its reason: a rule that appears
    -- in no run reads on the Data Retention page as a rule that was skipped.
    -- The count is the platform's, not this tenant's, and the page says so.
    --
    -- This tenant's own mode still decides what the line says: 'off' reports
    -- nothing rather than reporting a number this organization asked not to be
    -- shown a proposal for. It has already had its say in the unanimity test
    -- above, which is what stopped the delete.
    begin
      select mode into v_mode
        from public.retention_policies
       where policy_key = 'constituent_accounts' and tenant_id = v_tenant;

      if v_account_error is not null then
        v_failed := true;
        insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
        values (v_tenant, v_run_id, 'constituent_accounts', 'auth.users', 'skipped', v_account_error);
      elsif v_mode is null or v_mode = 'off' then
        perform public.retention_log(v_run_id, 'constituent_accounts', 'auth.users', 'skipped', '{}');
      else
        perform public.retention_log(v_run_id, 'constituent_accounts', 'auth.users', 'deleted', v_account_ids);
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'constituent_accounts', 'auth.users', 'skipped', sqlerrm);
    end;

    -- O. Volunteer screening outcomes (#1360).
    --
    -- coalesce(expires_on, cleared_on): a clearance that runs to 2032 is live
    -- until 2032, so the clock starts where the clearance ends, and falls back
    -- to the decision for one that never expires. The ::date cast is load
    -- bearing -- p_as_of is a timestamptz and both columns are date.
    --
    -- No audit-log residual to think about, and no redaction pass: this table
    -- has no free-text column, so the snapshot audit_log kept was already
    -- nothing but ids and dates.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_screenings' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_screenings', 'person_screenings', 'skipped', '{}');
      else
        v_ids := array(
          select s.id
            from public.person_screenings s
           where s.tenant_id = v_tenant
             and coalesce(s.expires_on, s.cleared_on) < (p_as_of - v_period)::date
        );
        perform public.retention_log(v_run_id, 'person_screenings', 'person_screenings', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.person_screenings where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_screenings', 'person_screenings', 'skipped', sqlerrm);
    end;

    update public.retention_runs
       set finished_at = now(),
           status = case when v_failed then 'partial' else 'succeeded' end
     where id = v_run_id;
  end loop;

  -- A single-tenant call answers with its run, which is what the portal needs
  -- to link straight to it. A sweep has no single run to name, and cron ignores
  -- the result.
  return v_result_run_id;
end;
$function$;
