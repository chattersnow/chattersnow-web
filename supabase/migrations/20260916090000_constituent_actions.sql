-- Acting from /my: registering, logging your own hours, choosing your email
-- (#1165, epic #1160).
--
-- #1163 gave a constituent a read of their own record and #1164 gave them a
-- write to it. This gives them three *actions*, each of which already has a
-- public anonymous equivalent. The signed-in version differs in one way that
-- matters more than any of the screens: it attaches to the caller's own
-- `people` row instead of matching or minting one from typed details, which
-- removes the largest single source of duplicate records in the directory.
--
-- The first user of all three is a staff member acting as themselves -- an
-- administrator registering for their own organization's event. Nothing below
-- reads a permission for that reason. A registration written by an
-- administrator and one written by a stranger differ only in which `people`
-- row they carry, and the functions here cannot tell the two apart because
-- they never ask.

-- ---------------------------------------------------------------------------
-- 1. One gate, three names
-- ---------------------------------------------------------------------------

-- Every constituent-facing function in this epic opens the same way: the
-- caller's own `people.id` in the tenant the *request host* resolves to, and
-- only when that tenant has the constituent area (plus, where the action
-- belongs to one, the module that owns it).
--
-- By #1164 there were three near-identical copies of that predicate --
-- my_public_person_id() (#1161), my_history_person_id() (#1163) and
-- my_contact_person_id() (#1164). A fourth for the write side would be the
-- point at which one of them drifts. So this is the predicate, once, and the
-- two module-aware names become one-line delegations to it. The behaviour of
-- both is unchanged; only the place it is written down moves.
--
-- A null `p_module_key` means "the constituent area itself and nothing
-- further", which is what contact details, notification preferences and the
-- claim flow need: a person's own address belongs to no feature module.
--
-- The module check lives here rather than only on the page because a page is
-- not what stops a request (#902). Every function below is reachable with curl
-- by anyone holding a session, so "the tenant turned the constituent area off"
-- has to mean the write is refused, not that the form is hidden.
create function public.my_constituent_person_id(p_module_key text default null)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
    from public.people p
   where p.auth_user_id = (select auth.uid())
     and p.tenant_id = (select public.public_tenant_id())
     and public.public_module_enabled('constituent_accounts')
     and (p_module_key is null or public.public_module_enabled(p_module_key))
   limit 1;
$$;

comment on function public.my_constituent_person_id(text) is
  'The caller''s people.id on the request host, or null when there is no session, no approved claim, or the tenant has the constituent area (or the named module) off (#1165). The one gate every /my read and write opens with.';

revoke execute on function public.my_constituent_person_id(text) from public, anon;
grant execute on function public.my_constituent_person_id(text) to authenticated, service_role;

-- The two names #1163 and #1164 already call, kept because four correct
-- functions calling them are correct as they stand, and rewriting a function
-- to change nothing about what it does is how a rewrite introduces something.
create or replace function public.my_history_person_id(p_module_key text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select public.my_constituent_person_id(p_module_key);
$$;

create or replace function public.my_contact_person_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select public.my_constituent_person_id(null);
$$;

-- ---------------------------------------------------------------------------
-- 2. Registering for an event as yourself
-- ---------------------------------------------------------------------------

-- What the event page needs to know before it decides which form to show: the
-- caller's own registration for this event, or no rows.
--
-- A function rather than a select through the `event_registrations` policies,
-- for the reason every reader in #1163 is one: that policy requires
-- events:view, which somebody looking at whether *they* are signed up has no
-- reason to hold. Takes an event id and nothing else -- whose registration it
-- returns is never the caller's to choose.
create function public.my_event_registration(p_event_id uuid)
returns table (
  registration_id uuid,
  party_size integer,
  notes text,
  registered_at timestamptz,
  checked_in_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id, r.party_size, r.notes, r.created_at, r.checked_in_at
    from public.event_registrations r
   where r.event_id = p_event_id
     and r.person_id = public.my_constituent_person_id('events')
   limit 1;
$$;

comment on function public.my_event_registration(uuid) is
  'The caller''s own registration for one event, or no rows (#1165). What the public event page reads to show "you are registered" instead of a second registration form.';

revoke execute on function public.my_event_registration(uuid) from public, anon;
grant execute on function public.my_event_registration(uuid) to authenticated;

-- The signed-in twin of register_for_event(), and deliberately a separate
-- function rather than an extra argument on that one.
--
-- The two have different *inputs*: the anonymous one is told a name and an
-- email and has to decide which person that is, through
-- resolve_or_create_person_by_email(), which is where duplicate `people` rows
-- come from. This one is never told. It reads the person from auth.uid() and
-- the request host, so there is nothing to match, nothing to create, and no
-- way for a caller to steer the registration onto somebody else's record by
-- typing their address. Folding that difference into one function would mean a
-- branch on "did you pass an email?" deciding whose history a registration
-- lands in, which is exactly the decision worth not having.
--
-- Everything else -- the rate limit, the event checks, the capacity lock, the
-- discount-code assignment -- is the same, because those are properties of the
-- event and not of who is asking.
--
-- What the caller *may* state is the shape of this one attendance: how many
-- are coming, a note, and the contact details to use for it. Those land on the
-- registration row and are not written back to `people`: #1164's allowlist is
-- the only way a person edits their own record, and a registration form is not
-- it. A phone number corrected here reaches the organizer of this event, which
-- is what the person meant by typing it; making it also overwrite the record
-- would be a second, invisible action they did not ask for.
create function public.register_myself_for_event(
  p_event_id uuid,
  p_party_size integer,
  p_notes text default null,
  p_phone text default null,
  p_pronouns text default null,
  p_instagram_handle text default null,
  p_ip_address inet default null
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
     instagram_handle, pronouns)
  values
    (v_tenant_id, p_event_id, v_person.display_name, v_person.email,
     nullif(btrim(coalesce(p_phone, '')), ''), p_party_size,
     nullif(btrim(coalesce(p_notes, '')), ''), v_person_id, v_handle, v_pronouns)
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

comment on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet) is
  'Registers the signed-in caller for a published public event under their own people row (#1165). Never matches or creates a person: the record is auth.uid() on the request host, so this path cannot produce a duplicate. Corrections travel on the registration and are not written back to people.';

revoke execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet) from public, anon;
grant execute on function public.register_myself_for_event(uuid, integer, text, text, text, text, inet) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Logging your own volunteer hours
-- ---------------------------------------------------------------------------

-- The decision #1165 asked to be taken and written down: **self-logged hours
-- are provisional until a volunteers:manage holder confirms them.**
--
-- Unreviewed hours feed impact reporting and reimbursements. A number that
-- reaches an annual report or a funder without anyone having looked at it is a
-- worse outcome than a small review queue, and it is the one that cannot be
-- taken back once the report is filed.
--
-- The provisional state is a **separate table**, not a status column on
-- `volunteer_hours`. A status column would mean every existing reader of the
-- ledger -- get_event_impact_derived_data(), get_program_impact_rollup_data(),
-- the participation page, the event roster, the person card, the role-flag
-- trigger -- had to remember a `where` clause it does not have today, and the
-- one that forgot would be a silently inflated figure. With a table of its
-- own, a pending entry is simply not in the ledger: nothing that reports on
-- hours has to change, and nothing can accidentally include it.
--
-- It is also the shape this codebase already uses for public intake reviewed
-- by staff -- `volunteer_applications`, `gear_requests`, `person_claims` all
-- land in their own table and are promoted by a decision -- rather than a new
-- one invented for this ticket.

-- `volunteer_hours` has never been the parent of a foreign key, so Phase 3
-- (20260906080000) had no reason to give it the key every parent of a
-- cross-tenant reference needs. It has one now.
alter table public.volunteer_hours
  add constraint volunteer_hours_tenant_id_id_key unique (tenant_id, id);

create table public.volunteer_hour_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  person_id uuid not null,
  event_id uuid,
  volunteer_role_type_id uuid,
  -- The same precision the ledger uses, with a ceiling the ledger does not
  -- need: a staffer entering 100 hours has a reason, and a volunteer entering
  -- 100 hours for one day has made a typo.
  hours numeric(5, 2) not null check (hours > 0 and hours <= 24),
  logged_date date not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined')),
  -- The ledger row this became, once somebody confirmed it. Null until then,
  -- and null forever for a declined one. This is the join that lets a
  -- volunteer's own history show one entry rather than two for the same hours.
  volunteer_hours_id uuid,
  created_at timestamptz not null default now(),
  -- Who entered it. Defaulted from auth.uid() like every other created_by, and
  -- the reason #1165 asks for it: whatever the ledger ends up saying, the
  -- record that the volunteer themselves typed this lives here.
  created_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  -- set_updated_at() writes updated_by alongside updated_at, so a table
  -- carrying the trigger has to carry the column.
  updated_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  -- Composite, like every other reference between two tenant tables
  -- (20260906080000): row-level security decides which rows a session can
  -- see, and says nothing about which rows a column may point at, so a
  -- cross-tenant reference has to be refused by the database itself.
  -- `set null (<column>)` rather than the bare form, which would try to null
  -- `tenant_id` too and fail on its not-null constraint.
  constraint volunteer_hour_submissions_person_in_tenant
    foreign key (tenant_id, person_id)
    references public.people (tenant_id, id) on delete cascade,
  constraint volunteer_hour_submissions_event_in_tenant
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id)
    on delete set null (event_id),
  constraint volunteer_hour_submissions_role_type_in_tenant
    foreign key (tenant_id, volunteer_role_type_id)
    references public.volunteer_role_types (tenant_id, id)
    on delete set null (volunteer_role_type_id),
  constraint volunteer_hour_submissions_hours_in_tenant
    foreign key (tenant_id, volunteer_hours_id)
    references public.volunteer_hours (tenant_id, id)
    on delete set null (volunteer_hours_id),
  -- A decision names its author and its moment, or it is not a decision.
  constraint volunteer_hour_submissions_reviewed_together check (
    status = 'pending'
    or (reviewed_by is not null and reviewed_at is not null)
  ),
  -- A pending or declined submission points at nothing. Without this, a
  -- decline could silently keep a link to hours that are being counted.
  --
  -- Deliberately not the stricter `(status = 'confirmed') = (id is not null)`:
  -- the reference is `on delete set null`, and a staffer deleting a confirmed
  -- entry from the ledger is an ordinary thing to do. Under the strict form
  -- that delete would fail on this check, leaving a row nobody could remove.
  -- Null on a confirmed submission reads correctly as "those hours are no
  -- longer in the ledger".
  constraint volunteer_hour_submissions_unconfirmed_has_no_ledger_row check (
    status = 'confirmed' or volunteer_hours_id is null
  )
);

create trigger set_updated_at before update on public.volunteer_hour_submissions
  for each row execute function public.set_updated_at();

-- One open submission per person per day per event. A double-tapped submit
-- button is the common case and it should not make a reviewer read the same
-- four hours twice. Partial on `pending`, so correcting a declined entry, or
-- logging a second stint after the first was confirmed, still works.
-- coalesce() rather than a nullable column in the index: two entries with no
-- event on the same day are the same entry for this purpose.
create unique index volunteer_hour_submissions_one_pending
  on public.volunteer_hour_submissions
     (tenant_id, person_id, logged_date, coalesce(event_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';

create index volunteer_hour_submissions_pending_idx
  on public.volunteer_hour_submissions (tenant_id, logged_date desc)
  where status = 'pending';

create index volunteer_hour_submissions_person_idx
  on public.volunteer_hour_submissions (person_id);

comment on table public.volunteer_hour_submissions is
  'Hours a volunteer logged for themselves from /my, provisional until a volunteers:manage holder confirms them (#1165). A confirmed submission becomes a volunteer_hours row; a pending one is deliberately not in the ledger, so nothing that reports on hours has to filter it out.';

alter table public.volunteer_hour_submissions enable row level security;

-- The reviewer's read. volunteers:view rather than :manage, so the
-- participation page can show the queue to everyone who can see the ledger and
-- only offer the decision to those who can take it.
create policy "reviewers read volunteer hour submissions"
  on public.volunteer_hour_submissions
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('volunteers', 'view')
  );

-- The volunteer's own read, on the public host. Pinned to the same gate every
-- other /my read uses, so it closes when the tenant turns the area off.
--
-- No insert, update or delete policy for either audience: both writes below
-- are security definer functions, which is what lets one of them move a row
-- into `volunteer_hours` -- a table a constituent has no grant on at all.
create policy "volunteers read own hour submissions"
  on public.volunteer_hour_submissions
  for select to authenticated
  using (
    tenant_id = (select public.public_tenant_id())
    and person_id = (select public.my_constituent_person_id('volunteers'))
  );

grant select on public.volunteer_hour_submissions to authenticated;

-- Confirming hours is a decision somebody made about a number that may end up
-- in a grant report or a reimbursement, which is the same argument that makes
-- person_claims audited. The volunteer's own prose and the reviewer's are
-- redacted for the reason the claim's are: audit_log is kept indefinitely, and
-- a note about somebody's shift is as personal as the rest of it. What the
-- trail keeps is that hours were claimed, how many, for when, who decided, and
-- what they decided.
insert into public.audited_tables (table_name, pk_column, redacted_columns) values
  ('volunteer_hour_submissions', 'id', array['notes', 'review_note']);

create trigger audit_log_row after insert or update or delete
  on public.volunteer_hour_submissions
  for each row execute function public.audit_log_row();

-- What the form is allowed to offer, which is the same set the write is
-- allowed to accept. Two functions rather than a select through the tables'
-- own policies, because both of those require volunteers:view -- a permission
-- a volunteer logging their own hours has no reason to hold.
--
-- Keeping the picker and the check in step matters more than it looks: a form
-- that offers an event the write refuses is a submit button that fails for
-- reasons the person cannot see. The predicate below is the one
-- log_my_volunteer_hours() applies, written once more rather than shared,
-- because a set-returning function and a row check are different shapes -- and
-- the integration test asserts the two agree.
--
create function public.my_loggable_events()
returns table (
  event_id uuid,
  name text,
  starts_at timestamptz,
  timezone text
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select public.my_constituent_person_id('volunteers') as person_id,
           public.public_tenant_id() as tenant_id
  )
  select e.id, e.name, e.starts_at, e.timezone
    from public.events e, me
   where me.person_id is not null
     and e.tenant_id = me.tenant_id
     and (
       (e.visibility = 'public' and e.status = 'published')
       or exists (
         select 1 from public.event_volunteers ev
          where ev.event_id = e.id and ev.person_id = me.person_id
       )
       or exists (
         select 1 from public.event_registrations r
          where r.event_id = e.id and r.person_id = me.person_id
       )
     )
   -- Past events first, newest first, then anything still to come. Hours are
   -- logged for a day that has already happened -- the date check below
   -- refuses a future one -- so the event somebody wants is almost always the
   -- last one they were at. An event that has not started yet is still
   -- offered, because setup happens the day before.
   order by (e.starts_at > now()), e.starts_at desc
   limit 50;
$$;

comment on function public.my_loggable_events() is
  'The past events a volunteer may attach their own logged hours to (#1165): this tenant''s published public events, plus any they signed up for or registered for. The same set log_my_volunteer_hours() accepts.';

revoke execute on function public.my_loggable_events() from public, anon;
grant execute on function public.my_loggable_events() to authenticated;

create function public.my_volunteer_role_types()
returns table (id uuid, name text)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.name
    from public.volunteer_role_types t
   where t.tenant_id = (select public.public_tenant_id())
     and public.my_constituent_person_id('volunteers') is not null
   order by t.name;
$$;

comment on function public.my_volunteer_role_types() is
  'The roles a volunteer may name when logging their own hours (#1165). The same set log_my_volunteer_hours() accepts.';

revoke execute on function public.my_volunteer_role_types() from public, anon;
grant execute on function public.my_volunteer_role_types() to authenticated;

-- The volunteer's half.
--
-- The event is optional and, when given, has to be one this person has a
-- reason to name: an event they signed up to volunteer at, one they registered
-- for, or one that is on the public site anyway. Not a security boundary --
-- an event id is an unguessable uuid and the public ones are published --
-- but it keeps a mistyped or pasted id from attaching somebody's hours to an
-- internal board meeting, where a reviewer would have to work out what
-- happened.
--
-- The date is checked against the tenant's own day (#1065), not the server's:
-- a volunteer in Denver logging Saturday's shift on Saturday evening is not
-- logging a future date, and would be told they were if this compared against
-- UTC.
create function public.log_my_volunteer_hours(
  p_hours numeric,
  p_logged_date date,
  p_event_id uuid default null,
  p_volunteer_role_type_id uuid default null,
  p_notes text default null,
  p_ip_address inet default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_person_id uuid;
  v_zone text;
  v_today date;
  v_submission_id uuid;
begin
  if not public.check_rate_limit('log_my_volunteer_hours', p_ip_address, 10, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  v_person_id := public.my_constituent_person_id('volunteers');
  if v_person_id is null then
    raise exception 'NO_RECORD';
  end if;

  if p_hours is null or p_hours <= 0 or p_hours > 24 then
    raise exception 'INVALID_HOURS';
  end if;

  select coalesce(value #>> '{}', 'UTC') into v_zone
    from public.app_settings
   where tenant_id = v_tenant_id and key = 'org.timezone';

  if v_zone is null or not exists (
    select 1 from pg_timezone_names where name = v_zone
  ) then
    v_zone := 'UTC';
  end if;

  v_today := (now() at time zone v_zone)::date;

  if p_logged_date is null or p_logged_date > v_today then
    raise exception 'DATE_IN_FUTURE';
  end if;

  if p_event_id is not null and not exists (
    select 1
      from public.events e
     where e.id = p_event_id
       and e.tenant_id = v_tenant_id
       and (
         (e.visibility = 'public' and e.status = 'published')
         or exists (
           select 1 from public.event_volunteers ev
            where ev.event_id = e.id and ev.person_id = v_person_id
         )
         or exists (
           select 1 from public.event_registrations r
            where r.event_id = e.id and r.person_id = v_person_id
         )
       )
  ) then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if p_volunteer_role_type_id is not null and not exists (
    select 1 from public.volunteer_role_types t
     where t.id = p_volunteer_role_type_id and t.tenant_id = v_tenant_id
  ) then
    raise exception 'ROLE_NOT_FOUND';
  end if;

  insert into public.volunteer_hour_submissions
    (tenant_id, person_id, event_id, volunteer_role_type_id, hours, logged_date, notes)
  values
    (v_tenant_id, v_person_id, p_event_id, p_volunteer_role_type_id, p_hours,
     p_logged_date, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_submission_id;

  return v_submission_id;
exception
  when unique_violation then
    raise exception 'ALREADY_SUBMITTED';
end;
$$;

comment on function public.log_my_volunteer_hours(numeric, date, uuid, uuid, text, inet) is
  'Logs hours for the signed-in caller from /my (#1165). Lands in volunteer_hour_submissions as pending, never in volunteer_hours: self-logged hours are provisional until a volunteers:manage holder confirms them.';

revoke execute on function public.log_my_volunteer_hours(numeric, date, uuid, uuid, text, inet) from public, anon;
grant execute on function public.log_my_volunteer_hours(numeric, date, uuid, uuid, text, inet) to authenticated;

-- The reviewer's half, and the only thing that moves self-logged hours into
-- the ledger.
--
-- Definer for two reasons. The write is two statements that have to be one --
-- the ledger row and the decision on the submission -- and the ledger row it
-- writes carries `logged_by` = the volunteer rather than the reviewer, which
-- the `volunteer_hours insert` policy would allow but no application code
-- should be trusted to remember. That column is the answer to #1165's "the row
-- must record that the volunteer entered it": a staffer reading Participation
-- sees the hours logged by the person who did them, with the reviewer in
-- `updated_by`.
--
-- `p_hours` lets a reviewer confirm a corrected number -- a volunteer typing 8
-- for a six-hour shift is the ordinary case, and making them resubmit to fix
-- it would mean a decline that reads as a rejection. The submission keeps what
-- was claimed; the ledger gets what was agreed.
create function public.review_volunteer_hour_submission(
  p_submission_id uuid,
  p_confirm boolean,
  p_note text default null,
  p_hours numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_submission public.volunteer_hour_submissions;
  v_hours numeric;
  v_hours_id uuid;
begin
  if not public.has_permission('volunteers', 'manage') then
    raise exception 'Not authorized to review volunteer hours';
  end if;

  select * into v_submission
    from public.volunteer_hour_submissions
   where id = p_submission_id
     and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'SUBMISSION_NOT_FOUND';
  end if;

  -- Already decided. Raising rather than quietly re-deciding: two reviewers
  -- opening the same queue is the ordinary case, and the second one needs to
  -- know their click did nothing rather than to be shown a success.
  if v_submission.status <> 'pending' then
    raise exception 'ALREADY_REVIEWED';
  end if;

  if not p_confirm then
    update public.volunteer_hour_submissions
       set status = 'declined',
           reviewed_by = (select auth.uid()),
           reviewed_at = now(),
           review_note = nullif(btrim(coalesce(p_note, '')), '')
     where id = p_submission_id;
    return;
  end if;

  v_hours := coalesce(p_hours, v_submission.hours);
  if v_hours <= 0 or v_hours > 24 then
    raise exception 'INVALID_HOURS';
  end if;

  insert into public.volunteer_hours
    (tenant_id, person_id, event_id, volunteer_role_type_id, hours, logged_date,
     notes, logged_by, updated_by)
  values
    (v_submission.tenant_id, v_submission.person_id, v_submission.event_id,
     v_submission.volunteer_role_type_id, v_hours, v_submission.logged_date,
     v_submission.notes, coalesce(v_submission.created_by, (select auth.uid())),
     (select auth.uid()))
  returning id into v_hours_id;

  update public.volunteer_hour_submissions
     set status = 'confirmed',
         hours = v_hours,
         volunteer_hours_id = v_hours_id,
         reviewed_by = (select auth.uid()),
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_submission_id;
end;
$$;

comment on function public.review_volunteer_hour_submission(uuid, boolean, text, numeric) is
  'Confirms or declines one self-logged hours submission (#1165). Confirming writes the volunteer_hours row, with logged_by naming the volunteer who entered it and updated_by naming the reviewer.';

revoke execute on function public.review_volunteer_hour_submission(uuid, boolean, text, numeric) from public, anon;
grant execute on function public.review_volunteer_hour_submission(uuid, boolean, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Hours a volunteer logged, in their own history
-- ---------------------------------------------------------------------------

-- #1163's volunteering section, with a fourth arm: the submissions that are
-- not in the ledger. Without it a volunteer who logs four hours watches them
-- disappear -- the entry is real, a reviewer has it, and the one screen built
-- to answer "what have I done" would say nothing about it.
--
-- `hours_unconfirmed` rather than folding them in as `hours`: the page totals
-- the `hours` rows, and a provisional number belongs in that total exactly as
-- little as it belongs in a grant report. `status` carries which it is, so a
-- declined entry can say so rather than vanish, which is the other way a
-- volunteer loses track of four hours.
--
-- A confirmed submission is not returned at all. Its ledger row is already in
-- the third arm, and returning both would show one shift twice.
create or replace function public.my_volunteer_history()
returns table (
  kind text,
  id uuid,
  occurred_at timestamptz,
  occurred_on date,
  status text,
  role text,
  event_id uuid,
  event_name text,
  event_timezone text,
  hours numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select public.my_history_person_id('volunteers') as person_id
  ),
  signup_role as (
    select ev.id,
           ev.event_id,
           coalesce(
             shift_type.name,
             signup_type.name,
             nullif(btrim(ev.role), '')
           ) as role
      from public.event_volunteers ev
      left join public.event_shifts s on s.id = ev.shift_id
      left join public.volunteer_role_types shift_type
        on shift_type.id = s.volunteer_role_type_id
      left join public.volunteer_role_types signup_type
        on signup_type.id = ev.volunteer_role_type_id
     where ev.person_id = (select person_id from me)
  )
  select 'application'::text, a.id, a.created_at, null::date, a.status,
         a.role_interest, null::uuid, null::text, null::text, null::numeric
    from public.volunteer_applications a
   where a.person_id = (select person_id from me)

  union all
  select 'signup'::text, ev.id, e.starts_at, null::date, null::text,
         sr.role, e.id, e.name, e.timezone, null::numeric
    from public.event_volunteers ev
    join public.events e on e.id = ev.event_id
    join signup_role sr on sr.id = ev.id
   where ev.person_id = (select person_id from me)

  union all
  select 'hours'::text, h.id, null::timestamptz, h.logged_date, null::text,
         coalesce(
           rt.name,
           (select sr.role
              from signup_role sr
             where sr.event_id = h.event_id
               and sr.role is not null
             limit 1)
         ),
         h.event_id, e.name, e.timezone, h.hours
    from public.volunteer_hours h
    left join public.events e on e.id = h.event_id
    left join public.volunteer_role_types rt on rt.id = h.volunteer_role_type_id
   where h.person_id = (select person_id from me)

  union all
  select 'hours_unconfirmed'::text, s.id, null::timestamptz, s.logged_date,
         s.status,
         coalesce(
           rt.name,
           (select sr.role
              from signup_role sr
             where sr.event_id = s.event_id
               and sr.role is not null
             limit 1)
         ),
         s.event_id, e.name, e.timezone, s.hours
    from public.volunteer_hour_submissions s
    left join public.events e on e.id = s.event_id
    left join public.volunteer_role_types rt on rt.id = s.volunteer_role_type_id
   where s.person_id = (select person_id from me)
     and s.status <> 'confirmed'

   order by 1, 3 desc nulls last, 4 desc nulls last;
$$;

comment on function public.my_volunteer_history() is
  'The caller''s own volunteer applications, event sign-ups, logged hours and unconfirmed submissions (#1163, #1165), discriminated by `kind`. One function because they are one activity to the person who did them.';

-- ---------------------------------------------------------------------------
-- 5. Choosing which emails you get
-- ---------------------------------------------------------------------------

-- The nearly-free one. `person_notification_preferences` exists, the editor
-- exists, and /portal/account already writes it.
--
-- What does not carry over is the policies. Their predicates are
-- `tenant_id = current_tenant_id()` and `person_id = my_person_id()`, and both
-- resolve through `tenant_memberships` -- which #1160 chose that a constituent
-- would never have. So both are null for the audience this ticket is for, and
-- a constituent writing that table directly is refused every time.
--
-- Two definer functions rather than widening those four policies with an `or`.
-- The policies are the portal's, they are correct, and every clause added to a
-- policy is a clause every future reader has to evaluate before they can say
-- who can write the table. The pair below is the same shape #1164 settled on
-- for contact details, for the same reason: on the public host, authorization
-- is "this row is yours", and a definer function is where that is stated once.
--
-- Note what is deliberately absent: a delete. A switch turned off writes
-- `enabled = false`, which is the evidence that the opt-out was honoured.
-- Deleting the row would erase it, and "no row" already means something else.

create function public.my_notification_preferences()
returns table (kind text, enabled boolean)
language sql
security definer
set search_path = public
stable
as $$
  select p.kind, p.enabled
    from public.person_notification_preferences p
   where p.person_id = public.my_constituent_person_id(null)
     and p.tenant_id = (select public.public_tenant_id());
$$;

comment on function public.my_notification_preferences() is
  'The caller''s own email opt-ins on the request host (#1165). The same rows /portal/account reads, reached without a tenant membership.';

revoke execute on function public.my_notification_preferences() from public, anon;
grant execute on function public.my_notification_preferences() to authenticated;

-- One kind, one answer. The kind is not validated against a list here: the
-- registry is NOTIFICATION_KINDS in src/lib/notifications/kinds.ts, adding to
-- it is a line of TypeScript and a sender rather than a migration
-- (20260906140000), and a database that had to be migrated to accept a new
-- switch would make that false. The column's own check constrains the shape,
-- and the Server Action refuses a key the registry does not hold -- so a
-- fabricated key can at worst write a row nothing ever reads.
create function public.set_my_notification_preference(
  p_kind text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid := public.my_constituent_person_id(null);
  v_tenant_id uuid := public.public_tenant_id();
begin
  if v_person_id is null then
    raise exception 'No record to set preferences for';
  end if;

  if p_kind is null or p_kind !~ '^[a-z0-9_]+$' then
    raise exception 'That is not something we send';
  end if;

  insert into public.person_notification_preferences (tenant_id, person_id, kind, enabled)
  values (v_tenant_id, v_person_id, p_kind, coalesce(p_enabled, false))
  on conflict (tenant_id, person_id, kind)
  do update set enabled = excluded.enabled,
                updated_at = now(),
                updated_by = (select auth.uid());
end;
$$;

comment on function public.set_my_notification_preference(text, boolean) is
  'Turns one kind of email on or off for the signed-in caller on the request host (#1165). Writes the same row /portal/account writes; never deletes one, because enabled = false is the record that an opt-out was honoured.';

revoke execute on function public.set_my_notification_preference(text, boolean) from public, anon;
grant execute on function public.set_my_notification_preference(text, boolean) to authenticated;
