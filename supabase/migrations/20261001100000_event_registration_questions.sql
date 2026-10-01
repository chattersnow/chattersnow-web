-- Per-event registration questions (#1501)
-- ---------------------------------------------------------------------------
--
-- An event can ask zero or more typed questions at registration, each answered
-- ONCE PER REGISTRATION -- a party travels together -- which is the deliberate
-- difference from #1407's options, answered per person as counts. Carpooling is
-- Chatter Snow's first use ("Getting there", "Seats available", "Leaving from",
-- "OK to share my name and contact with <partner>"); nothing here knows what a
-- carpool is.
--
-- Five kinds, and nothing more general than them:
--
--   single_choice   one option id               ["<uuid>"]  -> "<uuid>"
--   multi_choice    an array of option ids       ["<uuid>", ...]
--   short_text      a string, at most 500 characters
--   number          a whole number, within the question's optional min/max
--   consent         true or false: a declinable box in the tenant's own words
--
-- CONDITIONS ARE ONE LEVEL DEEP. `show_if` names an earlier single-choice
-- question and the option ids that reveal this one ({"question_id": ...,
-- "option_ids": [...]}). A question that is shown only conditionally cannot be
-- a condition itself. A hidden question is neither required nor stored,
-- whatever the client sent for it.
--
-- SHARING WITH A PARTNER IS A CONSENT QUESTION, NEVER IMPLIED BY REGISTERING
-- (#1318, docs/legal-basis.md). A consent question marked `shares_contact` is
-- what the answers export reads: a row's email and phone go into the file only
-- where that box was ticked. An event with no such question exports no contact
-- details at all.
--
-- ANSWERS KEEP THEIR WORDS, as #1407's counts do. Each answer copies the prompt
-- and, for a choice, the option labels as shown; editing a question never
-- rewrites an old answer. A question removed while it has answers is archived
-- rather than deleted, and its answers stay readable beside the registration.
--
-- AN EVENT WITH NO QUESTIONS IS UNCHANGED. Both registration RPCs gain one
-- trailing parameter that defaults to null, and an event with no rows below
-- neither asks nor refuses anything.
--
-- STAFF ARE NOT HELD TO `required`, as they are not held to #1407's caps: an
-- organizer adding a walk-in nobody asked about carpooling records what they
-- know.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

create table public.event_registration_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null,
  kind text not null
    constraint event_registration_questions_kind_check
      check (kind in ('single_choice', 'multi_choice', 'short_text', 'number', 'consent')),
  prompt text not null
    check (btrim(prompt) <> '' and char_length(prompt) <= 300),
  help text
    check (help is null or (btrim(help) <> '' and char_length(help) <= 500)),
  required boolean not null default false,
  sort_order integer not null default 0,
  -- [{"id": uuid, "label": text}, ...] for the two choice kinds, [] otherwise.
  -- Ids are minted by the editor so a condition can name an option of a
  -- question that is being created in the same save.
  options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(options) = 'array'),
  min_value integer,
  max_value integer,
  show_if jsonb
    check (show_if is null or jsonb_typeof(show_if) = 'object'),
  -- The consent question the answers export reads (see the header).
  shares_contact boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_registration_questions_tenant_id_id_key unique (tenant_id, id),
  constraint event_registration_questions_event_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade,
  constraint event_registration_questions_bounds_kind
    check (kind = 'number' or (min_value is null and max_value is null)),
  constraint event_registration_questions_bounds_order
    check (min_value is null or max_value is null or min_value <= max_value),
  constraint event_registration_questions_shares_contact_kind
    check (not shares_contact or kind = 'consent')
);

create index event_registration_questions_event_idx
  on public.event_registration_questions (event_id, sort_order);

comment on table public.event_registration_questions is
  'The typed questions an event asks at registration (#1501), answered once per registration in event_registration_answers. Kinds: single_choice, multi_choice, short_text, number, consent. show_if reveals a question only for given answers to an earlier single-choice question, one level deep. A question removed while it has answers is archived (archived_at), not deleted. Written only by save_event_registration_questions().';

create table public.event_registration_answers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  registration_id uuid not null,
  -- Null only if the question row is ever deleted outright; a question with
  -- answers is archived instead, so in practice this keeps pointing at it.
  question_id uuid,
  kind text not null,
  prompt_as_shown text not null,
  sort_order integer not null default 0,
  -- The raw answer: an option id, an array of option ids, a string, a whole
  -- number, or a boolean, by kind.
  value jsonb not null,
  -- The answer in words as shown: option labels, the text, the number, or
  -- Yes/No. What every reader displays, so a renamed option never rewrites it.
  answer_text text not null,
  answered_at timestamptz not null default now(),
  constraint event_registration_answers_registration_question_key
    unique (registration_id, question_id),
  constraint event_registration_answers_registration_fkey
    foreign key (tenant_id, registration_id)
    references public.event_registrations (tenant_id, id) on delete cascade,
  constraint event_registration_answers_question_fkey
    foreign key (tenant_id, question_id)
    references public.event_registration_questions (tenant_id, id)
    on delete set null (question_id)
);

create index event_registration_answers_question_idx
  on public.event_registration_answers (question_id);

comment on table public.event_registration_answers is
  'One registration''s answer to one of its event''s registration questions (#1501). prompt_as_shown and answer_text are copies of the words as shown, so editing or archiving the question never rewrites the answer. Personal data: free text can hold an address, so the retention purge''s rule C deletes a registration''s answers when it anonymizes the registration. Written only by apply_registration_answers(), through the registration RPCs, set_my_registration_answers() and set_registration_answers().';

-- Read under the same permission as the registrants they describe; written
-- only by the definer functions below. The revoke comes first because a
-- hosted project's default privileges hand every new table to both roles
-- (20260911010000, section 4).
alter table public.event_registration_questions enable row level security;
alter table public.event_registration_answers enable row level security;

revoke all on public.event_registration_questions, public.event_registration_answers
  from public, anon, authenticated;
grant select on public.event_registration_questions, public.event_registration_answers
  to authenticated;

create policy "event_registration_questions select" on public.event_registration_questions
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

create policy "event_registration_answers select" on public.event_registration_answers
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

-- Configuration is audited like the event it belongs to. The answers are not:
-- they are part of a registration, and event_registrations is not audited
-- either (20260922000000 says why), so retention_snapshot_personal_columns
-- does not arise for them. The purge reaches them directly (section 6).
insert into public.audited_tables (table_name, pk_column) values
  ('event_registration_questions', 'id');

create trigger audit_log_row after insert or update or delete
  on public.event_registration_questions
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 2. What the public form reads
-- ---------------------------------------------------------------------------

create view public.public_event_registration_questions
with (security_barrier = true) as
select
  q.id,
  q.event_id,
  q.kind,
  q.prompt,
  q.help,
  q.required,
  q.sort_order,
  q.options,
  q.min_value,
  q.max_value,
  q.show_if
from public.event_registration_questions q
join public.events e on e.id = q.event_id and e.tenant_id = q.tenant_id
where e.visibility = 'public'
  and e.status = 'published'
  and q.archived_at is null
  and q.tenant_id = public.public_tenant_id();

comment on view public.public_event_registration_questions is
  'The current registration questions of the resolved tenant''s published public events (#1501). Security definer by design (#887): the table has no anon select policy, and the public form reads as anon. Isolation is tenant_id = public_tenant_id() plus the visibility/status filters; archived questions and shares_contact stay out.';

revoke all on public.public_event_registration_questions from public, anon, authenticated;
grant select on public.public_event_registration_questions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Writing answers
-- ---------------------------------------------------------------------------

-- The one place answers are validated and written, so no two paths can
-- disagree about what is required, visible or well-formed.
--
-- p_answers is a JSON object of question id -> answer (see the header for the
-- shape per kind). Null or {} is "no answers". A key that is not a current
-- question of this event is refused; an answer to a question its condition
-- hides is dropped. Every current question's answer is replaced, so an answer
-- left out is cleared; answers to archived questions are kept.
--
--   p_required   refuse a visible required question left unanswered
--                (EVENT_ANSWERS_REQUIRED). Off for staff.
--
-- Called after the registration row exists, inside the caller's transaction,
-- so any refusal rolls the registration back with it.
create function public.apply_registration_answers(
  p_tenant_id uuid,
  p_event_id uuid,
  p_registration_id uuid,
  p_answers jsonb,
  p_required boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answers jsonb := '{}'::jsonb;
  v_question record;
  v_value jsonb;
  v_parent jsonb;
  v_text text;
  v_number numeric;
  v_ids text[];
begin
  if p_answers is not null and jsonb_typeof(p_answers) <> 'null' then
    if jsonb_typeof(p_answers) <> 'object' then
      raise exception 'EVENT_ANSWERS_INVALID';
    end if;
    -- Keys compared as lower-case text, so a malformed key is a refusal
    -- rather than a cast error.
    select coalesce(jsonb_object_agg(lower(key), value), '{}'::jsonb)
      into v_answers
      from jsonb_each(p_answers);
  end if;

  if exists (
    select 1
      from jsonb_object_keys(v_answers) as k(key)
      left join public.event_registration_questions q
        on q.id::text = k.key
       and q.event_id = p_event_id
       and q.tenant_id = p_tenant_id
       and q.archived_at is null
     where q.id is null
  ) then
    raise exception 'EVENT_ANSWERS_INVALID';
  end if;

  delete from public.event_registration_answers a
   using public.event_registration_questions q
   where a.registration_id = p_registration_id
     and a.tenant_id = p_tenant_id
     and q.id = a.question_id
     and q.archived_at is null;

  for v_question in
    select q.*
      from public.event_registration_questions q
     where q.event_id = p_event_id
       and q.tenant_id = p_tenant_id
       and q.archived_at is null
     order by q.sort_order, q.created_at
  loop
    -- One level: the parent is never conditional itself, so its own answer
    -- is all there is to read.
    if v_question.show_if is not null then
      v_parent := v_answers -> (v_question.show_if->>'question_id');
      if v_parent is null
         or jsonb_typeof(v_parent) <> 'string'
         or not ((v_question.show_if->'option_ids') ? lower(v_parent #>> '{}')) then
        continue;
      end if;
    end if;

    v_value := v_answers -> (v_question.id::text);
    if v_value is not null and jsonb_typeof(v_value) = 'null' then
      v_value := null;
    end if;
    v_text := null;

    if v_value is not null then
      case v_question.kind
        when 'single_choice' then
          if jsonb_typeof(v_value) <> 'string' then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          if btrim(v_value #>> '{}') = '' then
            v_value := null;
          else
            select o->>'label' into v_text
              from jsonb_array_elements(v_question.options) o
             where o->>'id' = lower(v_value #>> '{}');
            if v_text is null then
              raise exception 'EVENT_ANSWERS_INVALID';
            end if;
            v_value := to_jsonb(lower(v_value #>> '{}'));
          end if;

        when 'multi_choice' then
          if jsonb_typeof(v_value) <> 'array'
             or exists (select 1 from jsonb_array_elements(v_value) e where jsonb_typeof(e) <> 'string') then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          select array_agg(distinct lower(e #>> '{}')) into v_ids
            from jsonb_array_elements(v_value) e;
          if v_ids is null then
            v_value := null;
          else
            if exists (
              select 1 from unnest(v_ids) as i(id)
               where not exists (
                 select 1 from jsonb_array_elements(v_question.options) o where o->>'id' = i.id
               )
            ) then
              raise exception 'EVENT_ANSWERS_INVALID';
            end if;
            -- In the question's own order, whatever order they arrived in.
            select string_agg(o.value->>'label', ', ' order by o.ordinality),
                   jsonb_agg(o.value->>'id' order by o.ordinality)
              into v_text, v_value
              from jsonb_array_elements(v_question.options) with ordinality as o(value, ordinality)
             where o.value->>'id' = any (v_ids);
          end if;

        when 'short_text' then
          if jsonb_typeof(v_value) <> 'string' then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          v_text := btrim(v_value #>> '{}');
          if v_text = '' then
            v_value := null;
          elsif char_length(v_text) > 500 then
            raise exception 'EVENT_ANSWERS_INVALID';
          else
            v_value := to_jsonb(v_text);
          end if;

        when 'number' then
          if jsonb_typeof(v_value) <> 'number' then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          v_number := (v_value #>> '{}')::numeric;
          if v_number <> trunc(v_number)
             or v_number not between -1000000 and 1000000
             or (v_question.min_value is not null and v_number < v_question.min_value)
             or (v_question.max_value is not null and v_number > v_question.max_value) then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          v_value := to_jsonb(v_number::integer);
          v_text := v_number::integer::text;

        when 'consent' then
          if jsonb_typeof(v_value) <> 'boolean' then
            raise exception 'EVENT_ANSWERS_INVALID';
          end if;
          v_text := case when v_value = 'true'::jsonb then 'Yes' else 'No' end;
      end case;
    end if;

    if v_value is null then
      if v_question.required and p_required then
        raise exception 'EVENT_ANSWERS_REQUIRED';
      end if;
      continue;
    end if;

    insert into public.event_registration_answers
      (tenant_id, registration_id, question_id, kind, prompt_as_shown, sort_order, value, answer_text)
    values
      (p_tenant_id, p_registration_id, v_question.id, v_question.kind, v_question.prompt,
       v_question.sort_order, v_value, v_text);
  end loop;
end;
$$;

comment on function public.apply_registration_answers(uuid, uuid, uuid, jsonb, boolean) is
  'Validates and writes one registration''s answers to its event''s registration questions (#1501): an object of question id -> answer. Replaces the answers to current questions, keeps those to archived ones, drops answers to questions their condition hides. Raises EVENT_ANSWERS_INVALID, or EVENT_ANSWERS_REQUIRED when p_required and a visible required question is unanswered. Internal: called by the registration RPCs and the two set_* functions, never by a client.';

revoke execute on function public.apply_registration_answers(uuid, uuid, uuid, jsonb, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The two registration RPCs, each with one more parameter
-- ---------------------------------------------------------------------------
--
-- Bodies are 20260923160000's unchanged, plus the call after the option
-- counts. The new parameter trails, so they are dropped and recreated and
-- their grants restated.

drop function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean);

CREATE FUNCTION public.register_for_event(p_event_id uuid, p_name text, p_email text, p_phone text, p_party_size integer, p_notes text, p_honeypot text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_instagram_handle text DEFAULT NULL::text, p_pronouns text DEFAULT NULL::text, p_attended_before boolean DEFAULT NULL::boolean, p_waiver_accepted boolean DEFAULT false, p_waiver_version integer DEFAULT NULL::integer, p_party_includes_minor boolean DEFAULT NULL::boolean, p_accompanying_adult_name text DEFAULT NULL::text, p_accompanying_adult_phone text DEFAULT NULL::text, p_emergency_contact_name text DEFAULT NULL::text, p_emergency_contact_phone text DEFAULT NULL::text, p_photo_consent boolean DEFAULT NULL::boolean, p_option_counts jsonb DEFAULT NULL::jsonb, p_riding_discipline text DEFAULT NULL::text, p_ski_experience_level text DEFAULT NULL::text, p_snowboard_experience_level text DEFAULT NULL::text, p_preferred_mountain text DEFAULT NULL::text, p_adults_only_confirmed boolean DEFAULT NULL::boolean, p_answers jsonb DEFAULT NULL::jsonb)
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

  -- #1501. After the insert, like the counts above, and through the same
  -- function every other path uses; a refusal rolls the registration back.
  perform public.apply_registration_answers(
    v_tenant_id, p_event_id, v_registration_id, p_answers, true
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

comment on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean, jsonb) is
  'Anonymous public registration for a published public event. Asks every registrant whether they have been before (#1259) and whether their party includes anyone under 18 (#685) -- unless the tenant has turned that question off (#1416), when the answer and contacts are ignored and null is stored --, and stores both answers verbatim, null included; nothing it does varies with whether the email matched a directory record. A "yes" to the minors question must arrive with an accompanying adult and an emergency contact or it raises MINOR_CONTACTS_REQUIRED; an unanswered question is accepted, because the public API''s published contract predates it. Where the tenant has a participant waiver in force (#686), acceptance is required and the version accepted is recorded on the registration. Where the tenant has written a photo and media consent scope (#599), the answer is recorded with a snapshot of that scope -- a decline included, and a decline never refuses the registration. Where the event has registration options (#1407), p_option_counts is required and must add up to the party size, and a capped option is refused once full. Where the event has registration questions (#1501), p_answers must answer every visible required one and is validated by kind (EVENT_ANSWERS_REQUIRED, EVENT_ANSWERS_INVALID). Where the tenant has the rider_profile module, the riding answers are validated and written to the person (#1415); an unanswered discipline writes nothing. Where the event is adults only (#1417), the under-18 question is not asked, p_adults_only_confirmed must be true or it raises ADULTS_ONLY_CONFIRMATION_REQUIRED, and the confirmation is recorded as adults_only_confirmed_at.';

grant execute on function public.register_for_event(uuid, text, text, text, integer, text, text, inet, text, text, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean, jsonb) to anon, authenticated;

drop function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean);

CREATE FUNCTION public.register_myself_for_event(p_event_id uuid, p_party_size integer, p_notes text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_pronouns text DEFAULT NULL::text, p_instagram_handle text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_attended_before boolean DEFAULT NULL::boolean, p_waiver_accepted boolean DEFAULT false, p_waiver_version integer DEFAULT NULL::integer, p_party_includes_minor boolean DEFAULT NULL::boolean, p_accompanying_adult_name text DEFAULT NULL::text, p_accompanying_adult_phone text DEFAULT NULL::text, p_emergency_contact_name text DEFAULT NULL::text, p_emergency_contact_phone text DEFAULT NULL::text, p_photo_consent boolean DEFAULT NULL::boolean, p_option_counts jsonb DEFAULT NULL::jsonb, p_riding_discipline text DEFAULT NULL::text, p_ski_experience_level text DEFAULT NULL::text, p_snowboard_experience_level text DEFAULT NULL::text, p_preferred_mountain text DEFAULT NULL::text, p_adults_only_confirmed boolean DEFAULT NULL::boolean, p_answers jsonb DEFAULT NULL::jsonb)
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

  -- #1501. After the insert, like the counts above, and through the same
  -- function every other path uses; a refusal rolls the registration back.
  perform public.apply_registration_answers(
    v_tenant_id, p_event_id, v_registration_id, p_answers, true
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

comment on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean, jsonb) is
  'Registers the signed-in caller for a published public event under their own people row (#1165). Never matches or creates a person: the record is auth.uid() on the request host, so this path cannot produce a duplicate. Corrections travel on the registration and are not written back to people -- except the riding answers, which describe the person rather than this attendance and are written to them where the tenant has the rider_profile module (#1415). Asks the same self-reported "been here before?" question the anonymous form does (#1259), the same minors question (#685) where the tenant asks it (#1416), takes the same participant waiver where one is in force (#686) -- or reuses the caller''s acceptance of that version already on file, copying its version and date onto the registration, and puts a fresh acceptance on file (#1401) -- records the same photo and media consent where a scope is written (#599), takes the same registration-option counts where the event has options (#1407) and the same registration answers where it has questions (#1501), and requires and records the same adults-only confirmation where the event is 18+ (#1417).';

revoke execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet, boolean, boolean, integer, boolean, text, text, text, text, boolean, jsonb, text, text, text, text, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Changing answers afterwards
-- ---------------------------------------------------------------------------

-- The registrant's own, from /my/registration/[id]. Resolves the person
-- itself, like set_my_registration_option_counts(), so whose row is written is
-- never the caller's to choose. Held to `required` like a new registration --
-- this is how somebody who registered before the questions existed completes
-- them -- and open only while registration is.
create function public.set_my_registration_answers(
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

  select r.tenant_id, r.event_id, r.cancelled_at, e.registration_enabled, e.registration_deadline
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

  if not v_registration.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if v_registration.registration_deadline is not null and v_registration.registration_deadline < now() then
    raise exception 'REGISTRATION_DEADLINE_PASSED';
  end if;

  perform public.apply_registration_answers(
    v_registration.tenant_id, v_registration.event_id, p_registration_id, p_answers, true
  );
end;
$$;

comment on function public.set_my_registration_answers(uuid, jsonb) is
  'Changes the signed-in caller''s own answers to an event''s registration questions (#1501), for an active registration of theirs, while registration for the event is still open. Held to the same rules as registering, required questions included.';

revoke execute on function public.set_my_registration_answers(uuid, jsonb) from public, anon;
grant execute on function public.set_my_registration_answers(uuid, jsonb) to authenticated;

-- What /my/registration/[id] shows: every current question of the event with
-- the caller's answer to it, and whether they can still change it. Nothing for
-- a registration that is not theirs, the same silence
-- my_registration_option_counts() keeps.
create function public.my_registration_questions(p_registration_id uuid)
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
      and e.registration_enabled
      and (e.registration_deadline is null or e.registration_deadline >= now())
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
  'The signed-in caller''s own answers to an event''s registration questions (#1501): each current question with their answer, and whether registration is still open for changes. No rows for a registration that is not theirs or an event with no questions.';

revoke execute on function public.my_registration_questions(uuid) from public, anon;
grant execute on function public.my_registration_questions(uuid) to authenticated;

-- Staff, from the registrant detail sheet and the add-registrant and walk-in
-- dialogs. Not held to `required` -- see the header.
create function public.set_registration_answers(
  p_registration_id uuid,
  p_answers jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration record;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to edit registrations';
  end if;

  select tenant_id, event_id
    into v_registration
    from public.event_registrations
   where id = p_registration_id
     and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'REGISTRANT_NOT_FOUND';
  end if;

  perform public.apply_registration_answers(
    v_registration.tenant_id, v_registration.event_id, p_registration_id, p_answers, false
  );
end;
$$;

comment on function public.set_registration_answers(uuid, jsonb) is
  'Staff recording a registration''s answers to its event''s registration questions (#1501). Requires events: manage. Replaces the answers to the current questions; unlike the public paths a required question may be left unanswered.';

revoke execute on function public.set_registration_answers(uuid, jsonb) from public, anon;
grant execute on function public.set_registration_answers(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Setting the questions up
-- ---------------------------------------------------------------------------

-- Replaces an event's current questions in one call: p_questions is the whole
-- list in display order,
--
--   [{"id": uuid, "kind": text, "prompt": text, "help": text|null,
--     "required": bool, "options": [{"id": uuid, "label": text}, ...],
--     "min_value": int|null, "max_value": int|null, "shares_contact": bool,
--     "show_if": {"question_id": uuid, "option_ids": [uuid, ...]}|null}, ...]
--
-- Ids are the caller's to mint, so a condition can name a question and option
-- created in the same save. An existing id is updated in place -- and restored,
-- if it was archived -- so its answers keep pointing at it. A current question
-- left out is archived where it has answers and deleted where it has none.
create function public.save_event_registration_questions(
  p_event_id uuid,
  p_questions jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_question jsonb;
  v_index integer := 0;
  v_id uuid;
  v_kind text;
  v_prompt text;
  v_help text;
  v_required boolean;
  v_options jsonb;
  v_option jsonb;
  v_label text;
  v_min integer;
  v_max integer;
  v_shares boolean;
  v_show_if jsonb;
  v_parent jsonb;
  v_option_ids jsonb;
  v_seen jsonb := '{}'::jsonb;
  v_kept uuid[] := '{}';
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to edit events';
  end if;

  perform 1 from public.events
   where id = p_event_id and tenant_id = v_tenant_id
   for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'EVENT_QUESTIONS_INVALID';
  end if;

  if jsonb_array_length(p_questions) > 20 then
    raise exception 'EVENT_QUESTIONS_TOO_MANY';
  end if;

  for v_question in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(v_question) <> 'object'
       or coalesce(lower(v_question->>'id'), '') !~ v_uuid then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;
    v_id := (v_question->>'id')::uuid;
    if v_id = any (v_kept) then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_kind := v_question->>'kind';
    if v_kind is null or v_kind not in ('single_choice', 'multi_choice', 'short_text', 'number', 'consent') then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_prompt := btrim(coalesce(v_question->>'prompt', ''));
    if v_prompt = '' then
      raise exception 'EVENT_QUESTIONS_PROMPT_REQUIRED';
    end if;
    if char_length(v_prompt) > 300 then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    v_help := nullif(btrim(coalesce(v_question->>'help', '')), '');
    if char_length(v_help) > 500 then
      raise exception 'EVENT_QUESTIONS_INVALID';
    end if;

    -- A consent box is declinable by definition, so it is never required:
    -- an unticked box is the answer "no".
    v_required := v_kind <> 'consent' and coalesce(v_question->'required' = 'true'::jsonb, false);
    v_shares := v_kind = 'consent' and coalesce(v_question->'shares_contact' = 'true'::jsonb, false);

    -- Options: the two choice kinds need at least two, distinct by label.
    v_options := '[]'::jsonb;
    if v_kind in ('single_choice', 'multi_choice') then
      if jsonb_typeof(v_question->'options') is distinct from 'array'
         or jsonb_array_length(v_question->'options') < 2
         or jsonb_array_length(v_question->'options') > 20 then
        raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
      end if;
      for v_option in select value from jsonb_array_elements(v_question->'options') loop
        v_label := btrim(coalesce(v_option->>'label', ''));
        if jsonb_typeof(v_option) <> 'object'
           or coalesce(lower(v_option->>'id'), '') !~ v_uuid
           or v_label = '' or char_length(v_label) > 120 then
          raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
        end if;
        v_options := v_options || jsonb_build_array(
          jsonb_build_object('id', lower(v_option->>'id'), 'label', v_label)
        );
      end loop;
      if (select count(distinct o->>'id') from jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options)
         or (select count(distinct lower(o->>'label')) from jsonb_array_elements(v_options) o) <> jsonb_array_length(v_options) then
        raise exception 'EVENT_QUESTIONS_OPTIONS_INVALID';
      end if;
    end if;

    -- Bounds, for a number only.
    v_min := null;
    v_max := null;
    if v_kind = 'number' then
      if jsonb_typeof(v_question->'min_value') = 'number' then
        if (v_question->>'min_value')::numeric <> trunc((v_question->>'min_value')::numeric)
           or (v_question->>'min_value')::numeric not between -1000000 and 1000000 then
          raise exception 'EVENT_QUESTIONS_INVALID';
        end if;
        v_min := (v_question->>'min_value')::numeric::integer;
      elsif jsonb_typeof(v_question->'min_value') not in ('null') then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
      if jsonb_typeof(v_question->'max_value') = 'number' then
        if (v_question->>'max_value')::numeric <> trunc((v_question->>'max_value')::numeric)
           or (v_question->>'max_value')::numeric not between -1000000 and 1000000 then
          raise exception 'EVENT_QUESTIONS_INVALID';
        end if;
        v_max := (v_question->>'max_value')::numeric::integer;
      elsif jsonb_typeof(v_question->'max_value') not in ('null') then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
      if v_min is not null and v_max is not null and v_min > v_max then
        raise exception 'EVENT_QUESTIONS_INVALID';
      end if;
    end if;

    -- The condition: an EARLIER single-choice question of this save that is
    -- not conditional itself, and some of its options.
    v_show_if := null;
    if v_question->'show_if' is not null and jsonb_typeof(v_question->'show_if') <> 'null' then
      v_parent := v_seen -> lower(coalesce(v_question->'show_if'->>'question_id', ''));
      v_option_ids := v_question->'show_if'->'option_ids';
      if v_parent is null
         or v_parent->>'kind' <> 'single_choice'
         or (v_parent->>'conditional')::boolean
         or jsonb_typeof(v_option_ids) is distinct from 'array'
         or jsonb_array_length(v_option_ids) = 0
         or exists (
           select 1 from jsonb_array_elements(v_option_ids) i
            where jsonb_typeof(i) <> 'string'
               or not exists (
                 select 1 from jsonb_array_elements(v_parent->'options') o
                  where o->>'id' = lower(i #>> '{}')
               )
         ) then
        raise exception 'EVENT_QUESTIONS_CONDITION_INVALID';
      end if;
      v_show_if := jsonb_build_object(
        'question_id', lower(v_question->'show_if'->>'question_id'),
        'option_ids', (select jsonb_agg(distinct lower(i #>> '{}')) from jsonb_array_elements(v_option_ids) i)
      );
    end if;

    update public.event_registration_questions
       set kind = v_kind,
           prompt = v_prompt,
           help = v_help,
           required = v_required,
           sort_order = v_index,
           options = v_options,
           min_value = v_min,
           max_value = v_max,
           show_if = v_show_if,
           shares_contact = v_shares,
           archived_at = null,
           updated_at = now()
     where id = v_id
       and event_id = p_event_id
       and tenant_id = v_tenant_id;

    if not found then
      begin
        insert into public.event_registration_questions
          (id, tenant_id, event_id, kind, prompt, help, required, sort_order,
           options, min_value, max_value, show_if, shares_contact)
        values
          (v_id, v_tenant_id, p_event_id, v_kind, v_prompt, v_help, v_required, v_index,
           v_options, v_min, v_max, v_show_if, v_shares);
      exception when unique_violation then
        -- The id belongs to another event's question.
        raise exception 'EVENT_QUESTIONS_INVALID';
      end;
    end if;

    v_seen := v_seen || jsonb_build_object(v_id::text, jsonb_build_object(
      'kind', v_kind, 'options', v_options, 'conditional', v_show_if is not null
    ));
    v_kept := v_kept || v_id;
    v_index := v_index + 1;
  end loop;

  -- Left out: archived where somebody answered it, so the answers stay
  -- readable, and gone where nobody did.
  update public.event_registration_questions q
     set archived_at = now(), updated_at = now()
   where q.event_id = p_event_id
     and q.tenant_id = v_tenant_id
     and q.archived_at is null
     and not (q.id = any (v_kept))
     and exists (select 1 from public.event_registration_answers a where a.question_id = q.id);

  delete from public.event_registration_questions q
   where q.event_id = p_event_id
     and q.tenant_id = v_tenant_id
     and not (q.id = any (v_kept))
     and not exists (select 1 from public.event_registration_answers a where a.question_id = q.id);
end;
$$;

comment on function public.save_event_registration_questions(uuid, jsonb) is
  'Replaces an event''s registration questions (#1501) in one call, in display order. Ids are minted by the caller; an existing id is updated in place (and restored if archived). A current question left out is archived where it has answers and deleted where it has none. Requires events: manage. Raises EVENT_QUESTIONS_INVALID, EVENT_QUESTIONS_TOO_MANY (more than 20), EVENT_QUESTIONS_PROMPT_REQUIRED, EVENT_QUESTIONS_OPTIONS_INVALID or EVENT_QUESTIONS_CONDITION_INVALID.';

revoke execute on function public.save_event_registration_questions(uuid, jsonb) from public, anon;
grant execute on function public.save_event_registration_questions(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Retention
-- ---------------------------------------------------------------------------
--
-- Rule C anonymizes a registration three years after its event; the answers
-- go with the name. Free text can hold an address, and a consent to share
-- contact details with a partner is, like photo consent (#599), worthless once
-- the row cannot be tied to a person. Deleted rather than blanked: an answer
-- with its value removed says nothing. They join the selector as well as the
-- update, so a row whose only remaining personal data is an answer is still
-- picked up on a later run.
--
-- The body is the live one from 20260923160000 with those two edits and
-- nothing else. Re-emitted in full because the function is one plpgsql block;
-- the signature is unchanged, so `create or replace` is enough and the pg_cron
-- entry (20260905140000) keeps resolving to this one.

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
                  or r.photo_consent is not null
                  -- #1501
                  or exists (select 1 from public.event_registration_answers a
                              where a.registration_id = r.id))
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
          -- #1501. The answers go with the name.
          delete from public.event_registration_answers
           where registration_id = any(v_ids);
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
