-- Event reminder email N days before (#1652).
--
-- A registrant on a tenant without accounts finds their registration again
-- only through an emailed link (#1591), and the newest one is weeks old by
-- the event. This sends each active registration one reminder before the
-- event: the details, their carpool (#1651) and a fresh answers link.
--
-- THE SWITCH. `events.reminder_enabled`, on for new events and off for every
-- event that exists today -- turning it on for those would mail people about
-- events staff never chose to remind them of. `reminder_days_before` (1 to 14,
-- default 2) and an optional `reminder_intro` sit beside it on Planning.
--
-- WHEN. event_reminder_send_at(): the event's local date minus N days, at
-- 09:00 in the event's own zone. The cron runs hourly, so the mail lands in
-- the event's morning wherever its tenant is.
--
-- ONCE. `event_registrations.reminder_sent_at`, stamped by
-- claim_event_reminders() *before* anything is sent, under `for update skip
-- locked`, so two overlapping runs (or the two Vercel projects that share
-- vercel.json) can never claim one registration twice. A registration made
-- after the send time is never claimed: its confirmation is recent enough.
--
-- HOW MANY. The Resend account is on the free tier (100 a day). The job
-- passes how many it may send this run and claims no more; the rest are
-- claimed by a later run. event_reminder_status() tells Planning how far it
-- has got.

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

-- Off for the rows that exist now, on for every event created from here.
alter table public.events
  add column reminder_enabled boolean not null default false,
  add column reminder_days_before integer not null default 2
    constraint events_reminder_days_before_range
      check (reminder_days_before between 1 and 14),
  add column reminder_intro text
    constraint events_reminder_intro_length
      check (char_length(reminder_intro) between 1 and 1000);

alter table public.events alter column reminder_enabled set default true;

comment on column public.events.reminder_enabled is
  'Whether every active registration with an email gets one reminder before the event (#1652). On by default for new events; events that predate it were left off.';
comment on column public.events.reminder_days_before is
  'How many days before the event''s local start date the reminder goes, at 09:00 in the event''s zone (#1652). 1 to 14.';
comment on column public.events.reminder_intro is
  'The staff-written opening paragraph of the reminder (#1652). Null uses the platform default.';

alter table public.event_registrations
  add column reminder_sent_at timestamptz;

comment on column public.event_registrations.reminder_sent_at is
  'When this registration was sent the event reminder (#1652), by the hourly job or by "Send reminder now". Written before the send, so a retried run cannot send twice. Null is not sent.';

-- event_registrations is read through column grants (20260922040000).
grant select (reminder_sent_at) on public.event_registrations to authenticated;

-- The job's scan: due registrations not yet sent.
create index event_registrations_reminder_due_idx
  on public.event_registrations (tenant_id, event_id)
  where reminder_sent_at is null and cancelled_at is null;

-- The budget's count: sends in the last day.
create index event_registrations_reminder_sent_idx
  on public.event_registrations (reminder_sent_at)
  where reminder_sent_at is not null;

-- ---------------------------------------------------------------------------
-- 2. When
-- ---------------------------------------------------------------------------

create function public.event_reminder_send_at(
  p_starts_at timestamptz,
  p_timezone text,
  p_days_before integer
)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select ((((p_starts_at at time zone p_timezone)::date - p_days_before)
           + time '09:00') at time zone p_timezone);
$$;

comment on function public.event_reminder_send_at(timestamptz, text, integer) is
  'When an event''s reminder goes (#1652): its local start date minus the days, at 09:00 in its own zone.';

-- ---------------------------------------------------------------------------
-- 3. What one reminder says
-- ---------------------------------------------------------------------------

-- Everything the sender needs for one registration, read on the service role.
-- The carpool card is carpool_assignment_card()'s, so the reminder can show
-- nothing the card would not.
create function public.event_reminder_message(p_registration_id uuid)
returns table (
  registration_id uuid,
  tenant_id uuid,
  event_id uuid,
  name text,
  email text,
  person_id uuid,
  event_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  location text,
  reminder_intro text,
  carpools_enabled boolean,
  car jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.tenant_id, r.event_id, r.name, btrim(r.email), r.person_id,
         e.name, e.starts_at, e.ends_at, e.timezone, e.location,
         e.reminder_intro, e.carpools_enabled,
         case when e.carpools_enabled
              then public.carpool_assignment_card(r.id) end
    from public.event_registrations r
    join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
   where r.id = p_registration_id
     and r.cancelled_at is null
     and nullif(btrim(coalesce(r.email, '')), '') is not null;
$$;

comment on function public.event_reminder_message(uuid) is
  'Internal (#1652): what the reminder for one active registration with an email says -- the registrant''s name and address, the event''s name, times, zone, location and intro, and the carpool card when the event has carpools on. Service role only.';

revoke execute on function public.event_reminder_message(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The job's claim
-- ---------------------------------------------------------------------------

-- Up to p_limit of one tenant's due registrations, stamped sent and returned.
-- Due: a published, reminder-on event whose send time has passed and whose
-- start has not; an active registration with an email, made before the send
-- time, not yet sent. Oldest send time first, so an event the budget cut short
-- yesterday finishes before today's start.
create function public.claim_event_reminders(p_tenant_id uuid, p_limit integer)
returns setof uuid
language sql
volatile
security definer
set search_path = public
as $$
  with due as (
    select r.id
      from public.event_registrations r
      join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
     where r.tenant_id = p_tenant_id
       and r.reminder_sent_at is null
       and r.cancelled_at is null
       and nullif(btrim(coalesce(r.email, '')), '') is not null
       and e.reminder_enabled
       and e.status = 'published'
       and e.starts_at > now()
       and public.event_reminder_send_at(e.starts_at, e.timezone, e.reminder_days_before) <= now()
       and r.created_at < public.event_reminder_send_at(e.starts_at, e.timezone, e.reminder_days_before)
     order by public.event_reminder_send_at(e.starts_at, e.timezone, e.reminder_days_before),
              e.id, r.created_at, r.id
     limit greatest(coalesce(p_limit, 0), 0)
       for update of r skip locked
  )
  update public.event_registrations r
     set reminder_sent_at = now()
    from due
   where r.id = due.id
  returning r.id;
$$;

comment on function public.claim_event_reminders(uuid, integer) is
  'The hourly job''s claim (#1652): stamps up to p_limit of a tenant''s due registrations as sent and returns their ids. Stamped before the send, under skip locked, so no registration is claimed twice. Service role only.';

revoke execute on function public.claim_event_reminders(uuid, integer) from public, anon, authenticated;

-- The tenants with at least one due registration, so the job opens a mail
-- context only where it will send. claim_event_reminders()'s conditions.
create function public.event_reminder_due_tenants()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct r.tenant_id
    from public.event_registrations r
    join public.events e on e.id = r.event_id and e.tenant_id = r.tenant_id
   where r.reminder_sent_at is null
     and r.cancelled_at is null
     and nullif(btrim(coalesce(r.email, '')), '') is not null
     and e.reminder_enabled
     and e.status = 'published'
     and e.starts_at > now()
     and public.event_reminder_send_at(e.starts_at, e.timezone, e.reminder_days_before) <= now()
     and r.created_at < public.event_reminder_send_at(e.starts_at, e.timezone, e.reminder_days_before);
$$;

revoke execute on function public.event_reminder_due_tenants() from public, anon, authenticated;

-- How many reminders went in the last day, across every tenant: the Resend
-- account's daily cap is shared.
create function public.event_reminders_sent_since(p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.event_registrations
   where reminder_sent_at >= p_since;
$$;

revoke execute on function public.event_reminders_sent_since(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. "Send reminder now"
-- ---------------------------------------------------------------------------

-- Stamps one registration sent, at events: manage, for this tenant's event.
-- Returns false for a cancelled registration or one without an email, which
-- the action turns into a message. Sends again when already sent: staff asked.
create function public.stamp_event_reminder(p_registration_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_found boolean;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'FORBIDDEN';
  end if;

  update public.event_registrations r
     set reminder_sent_at = now()
   where r.id = p_registration_id
     and r.tenant_id = (select public.current_tenant_id())
     and r.cancelled_at is null
     and nullif(btrim(coalesce(r.email, '')), '') is not null
  returning true into v_found;

  return coalesce(v_found, false);
end;
$$;

comment on function public.stamp_event_reminder(uuid) is
  'Marks one active registration with an email as sent the reminder (#1652), for "Send reminder now" at events: manage. False when there is nothing to send to.';

revoke execute on function public.stamp_event_reminder(uuid) from public, anon;
grant execute on function public.stamp_event_reminder(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Planning's status line
-- ---------------------------------------------------------------------------

-- "Scheduled for {date} · {n} recipients", and once it has started, how many
-- are sent. Recipients counts every active registration with an email made
-- before the send time; sent counts those of them stamped.
create function public.event_reminder_status(p_event_id uuid)
returns table (send_at timestamptz, recipients integer, sent integer)
language sql
stable
security definer
set search_path = public
as $$
  with e as (
    select ev.id, ev.tenant_id,
           public.event_reminder_send_at(ev.starts_at, ev.timezone, ev.reminder_days_before) as send_at
      from public.events ev
     where ev.id = p_event_id
       and ev.tenant_id = (select public.current_tenant_id())
       and public.has_permission('events', 'view')
  )
  select e.send_at,
         count(r.id) filter (where r.created_at < e.send_at)::integer,
         count(r.id) filter (where r.created_at < e.send_at and r.reminder_sent_at is not null)::integer
    from e
    left join public.event_registrations r
      on r.event_id = e.id
     and r.tenant_id = e.tenant_id
     and r.cancelled_at is null
     and nullif(btrim(coalesce(r.email, '')), '') is not null
   group by e.send_at;
$$;

comment on function public.event_reminder_status(uuid) is
  'When an event''s reminder goes (#1652), how many registrations it goes to and how many have been sent. Answers an events: view holder, for an event of their own tenant, only.';

revoke execute on function public.event_reminder_status(uuid) from public, anon;
grant execute on function public.event_reminder_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The answers link
-- ---------------------------------------------------------------------------

alter table public.event_registration_answer_requests
  drop constraint event_registration_answer_requests_source_check,
  add constraint event_registration_answer_requests_source_check
    check (source in ('staff', 'confirmation', 'already_registered', 'carpool_assignment', 'reminder'));

-- 20261022170000's body with one more source: the reminder's fresh link,
-- which replaces the one before it (#1591: the newest email always works).
CREATE OR REPLACE FUNCTION public.issue_registration_answer_link(p_registration_id uuid, p_token_hash text, p_source text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_registration record;
  v_expires_at timestamptz;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ANSWER_REQUESTS_INVALID';
  end if;
  if p_source is null or p_source not in ('confirmation', 'already_registered', 'carpool_assignment', 'reminder') then
    raise exception 'ANSWER_REQUESTS_INVALID';
  end if;

  select reg.id, reg.tenant_id, e.starts_at, e.ends_at
    into v_registration
    from public.event_registrations reg
    join public.events e on e.id = reg.event_id and e.tenant_id = reg.tenant_id
   where reg.id = p_registration_id
     and reg.cancelled_at is null
     and (exists (
            select 1
              from public.event_registration_questions q
             where q.event_id = e.id
               and q.tenant_id = e.tenant_id
               and q.archived_at is null
          )
          -- #1647
          or public.tenant_requires_instagram(reg.tenant_id)
          -- #1651
          or e.carpools_enabled);

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
$function$;

comment on function public.issue_registration_answer_link(uuid, text, text) is
  'Hands a registrant their own answers link (#1591): from the confirmation (''confirmation''), a second registration attempt (''already_registered''), the carpool assignment email (''carpool_assignment'', #1651) or the event reminder (''reminder'', #1652). Service role only, because the caller supplies the token hash. Supersedes any earlier link for the registration. Returns the expiry, or null where nothing was issued: no such active registration, nothing on the page (no current questions, no Instagram requirement -- #1647 -- and no carpools -- #1651), or the event has ended.';
