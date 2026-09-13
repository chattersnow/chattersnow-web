-- Issue #1049, following #1042: a notification override took effect the moment
-- it was typed, so a mistyped address received somebody's mail on the next
-- send.
--
-- What that leaks is not a bounce. A task digest carries governance action-item
-- descriptions; a submission notice carries a member of the public's name,
-- address and topic. One wrong character sends a third party's personal data to
-- a stranger's inbox -- and the bounces and complaints that follow land on the
-- one Resend sending domain every tenant's mail depends on.
--
-- The shape here is chosen so that nothing anywhere in the confirmation flow
-- can send mail to an unproven address: `notification_email` keeps its meaning
-- from #1042 and is only ever written by a confirmed token, while an unproven
-- address waits in `notification_email_pending`, which no sender reads.
-- Delivery is still coalesce(notification_email, email), unchanged and
-- untouched by this migration, so every failure mode here -- an expired token,
-- an email that never arrives, a bug in the route -- leaves mail going to the
-- address the person signs in with.
--
-- The raw token never reaches the database. The Server Action mints it, sends
-- it, and stores only its SHA-256; confirming hashes what the link presented
-- and matches on that. So a database backup, a log line, or a `select *` by
-- anyone holding people:view yields nothing that can confirm an address.

-- people_with_roles selects p.*, expanded at creation time, so new people
-- columns go through a drop and recreate (20260903030000); the computed
-- relationship takes the view's composite type, so it goes first and comes back
-- after.
drop function public.primary_contact(public.people_with_roles);
drop view public.people_with_roles;

alter table public.people
  add column notification_email_pending text
  check (
    notification_email_pending is null
    or notification_email_pending ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  ),
  add column notification_email_token text
  check (
    notification_email_token is null
    or notification_email_token ~ '^[0-9a-f]{64}$'
  ),
  add column notification_email_token_expires_at timestamptz,
  -- The three are one fact and have no partial state: a pending address with no
  -- way to confirm it would sit in the UI forever, and a live token with no
  -- address behind it would confirm nothing.
  add constraint people_notification_email_pending_complete check (
    num_nonnulls(
      notification_email_pending,
      notification_email_token,
      notification_email_token_expires_at
    ) in (0, 3)
  );

comment on column public.people.notification_email_pending is
  'An override this person has asked for but not yet proven they hold (#1049). No sender reads this column -- delivery stays on coalesce(notification_email, email) until confirm_notification_email() promotes it.';

comment on column public.people.notification_email_token is
  'SHA-256 of the confirmation token for notification_email_pending (#1049). The raw token exists only in the email that carried it: it is minted in the Server Action and hashed before it is stored, so nothing recoverable from the database can confirm an address.';

comment on column public.people.notification_email_token_expires_at is
  'When the pending override''s confirmation link stops working (#1049). A person can ask for a new one, which mints a new token and supersedes this row''s.';

create view public.people_with_roles
with (security_invoker = true) as
select
  p.*,
  f.is_donor,
  f.is_sponsor,
  f.is_volunteer,
  f.is_attendee,
  f.is_staff,
  f.is_partner
from public.people p
cross join lateral public.person_role_flags(p.id) f;

grant select on public.people_with_roles to authenticated;

create function public.primary_contact(public.people_with_roles)
returns setof public.people
rows 1
language sql
stable
as $$
  select * from public.people where id = $1.primary_contact_person_id;
$$;

grant execute on function public.primary_contact(public.people_with_roles) to authenticated;

-- 20260914010000 put the canonicalization and the anonymized-row rule here for
-- every writer at once; the pending address joins both. Clearing all three
-- together is what keeps people_notification_email_pending_complete satisfiable
-- from a plain `update people set notification_email_pending = null`, which is
-- how a caller would reasonably cancel a request.
create or replace function public.normalize_person_email()
returns trigger
language plpgsql
as $$
begin
  new.email := nullif(lower(trim(new.email)), '');
  new.notification_email := nullif(lower(trim(new.notification_email)), '');
  new.notification_email_pending := nullif(lower(trim(new.notification_email_pending)), '');

  if new.is_anonymous then
    new.notification_email := null;
    new.notification_email_pending := null;
  end if;

  if new.notification_email_pending is null then
    new.notification_email_token := null;
    new.notification_email_token_expires_at := null;
  end if;

  return new;
end;
$$;

-- The pending address is an address, and person_merges snapshots people rows,
-- so it belongs in the redaction register for exactly the reason
-- notification_email does.
--
-- Its token and expiry are registered too, and that is not an accident of the
-- name: retention_unregistered_personal_columns() (20260907150000) matches
-- `email` in a column name on purpose, and the honest answer to a column it
-- flags is to register it rather than to rename around the guard. They are also
-- genuinely the pending address's own state -- a snapshot that kept a live
-- token beside a redacted address would be the worse of the two outcomes.
insert into public.retention_snapshot_personal_columns (table_name, column_name) values
  ('people', 'notification_email_pending'),
  ('people', 'notification_email_token'),
  ('people', 'notification_email_token_expires_at');

-- ---------------------------------------------------------------------------
-- Asking for an address
-- ---------------------------------------------------------------------------

-- Both setters return the same three-value outcome, because the caller has to
-- know whether to send anything:
--
--   'cleared'   the override is gone; mail goes to the sign-in address again.
--   'unchanged' the request asked for what is already in force.
--   'pending'   the address is recorded and waiting; send the link.
--
-- Clearing and reverting are immediate and unverified by design. Both are a
-- step *towards* the address the identity provider already proved, so there is
-- nothing left to prove -- and a confirmation step on "stop sending mail
-- somewhere" would be a trap rather than a safeguard.

drop function public.set_my_notification_email(text);

create function public.set_my_notification_email(
  p_email text,
  p_token_hash text
)
returns table (
  outcome text,
  person_id uuid,
  tenant_id uuid,
  display_name text,
  pending_email text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.people;
  v_person_id uuid;
  v_display_name text;
  v_email text := nullif(lower(btrim(p_email)), '');
  v_expires_at timestamptz := now() + interval '24 hours';
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  -- Deliberately loose, and the same shape as the column's check constraint:
  -- this catches a stray word or a truncated paste, not an address a mail
  -- server would refuse. Only the provider can answer that.
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'That does not look like an email address';
  end if;

  if v_email is not null and (p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'A confirmation token is required';
  end if;

  select ecp.person_id into v_person_id from public.ensure_current_person() ecp;

  if v_person_id is null then
    raise exception 'No person record for the current user';
  end if;

  select * into v_person from public.people where id = v_person_id;
  v_display_name := coalesce(v_person.preferred_name, v_person.name);

  -- Naming the address the account signs in with is not an override at all, and
  -- OAuth has already proved that one. Treating it as a clear saves a
  -- confirmation email nobody would learn anything from.
  if v_email is null or v_email = lower(coalesce(v_person.email, '')) then
    update public.people
       set notification_email = null,
           notification_email_pending = null
     where id = v_person_id;
    return query select 'cleared'::text, v_person.id, v_person.tenant_id, v_display_name, null::text, null::timestamptz;
    return;
  end if;

  if v_email = lower(coalesce(v_person.notification_email, '')) then
    -- Already in force. Drop any competing request so the UI does not keep
    -- offering to confirm an address that is already the one being used.
    update public.people
       set notification_email_pending = null
     where id = v_person_id;
    return query select 'unchanged'::text, v_person.id, v_person.tenant_id, v_display_name, null::text, null::timestamptz;
    return;
  end if;

  update public.people
     set notification_email_pending = v_email,
         notification_email_token = p_token_hash,
         notification_email_token_expires_at = v_expires_at
   where id = v_person_id;

  return query select 'pending'::text, v_person.id, v_person.tenant_id, v_display_name, v_email, v_expires_at;
end;
$$;

grant execute on function public.set_my_notification_email(text, text) to authenticated;

-- The administrator's side, from the Portal account card on a person's record.
-- Same rule and the same pending state: an admin typing an address for somebody
-- else is the same risk as typing it for themselves, and the confirmation link
-- goes to the address being claimed, not to the admin -- so an admin cannot
-- complete the loop on behalf of a mailbox they do not hold.
drop function public.set_notification_email_for_person(uuid, text);

create function public.set_notification_email_for_person(
  p_person_id uuid,
  p_email text,
  p_token_hash text
)
returns table (
  outcome text,
  person_id uuid,
  tenant_id uuid,
  display_name text,
  pending_email text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.people;
  v_display_name text;
  v_email text := nullif(lower(btrim(p_email)), '');
  v_expires_at timestamptz := now() + interval '24 hours';
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('people', 'manage') then
    raise exception 'Not authorized';
  end if;

  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'That does not look like an email address';
  end if;

  if v_email is not null and (p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'A confirmation token is required';
  end if;

  -- Aliased because this function's OUT columns include `tenant_id`, and an
  -- unqualified reference resolves to that rather than to the table.
  select p.* into v_person
    from public.people p
   where p.id = p_person_id and p.tenant_id = v_tenant_id;

  if not found then
    raise exception 'No such person';
  end if;

  v_display_name := coalesce(v_person.preferred_name, v_person.name);

  if v_email is null or v_email = lower(coalesce(v_person.email, '')) then
    update public.people
       set notification_email = null,
           notification_email_pending = null
     where id = p_person_id;
    return query select 'cleared'::text, v_person.id, v_person.tenant_id, v_display_name, null::text, null::timestamptz;
    return;
  end if;

  if v_email = lower(coalesce(v_person.notification_email, '')) then
    update public.people
       set notification_email_pending = null
     where id = p_person_id;
    return query select 'unchanged'::text, v_person.id, v_person.tenant_id, v_display_name, null::text, null::timestamptz;
    return;
  end if;

  update public.people
     set notification_email_pending = v_email,
         notification_email_token = p_token_hash,
         notification_email_token_expires_at = v_expires_at
   where id = p_person_id;

  return query select 'pending'::text, v_person.id, v_person.tenant_id, v_display_name, v_email, v_expires_at;
end;
$$;

grant execute on function public.set_notification_email_for_person(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Proving it
-- ---------------------------------------------------------------------------

-- Callable by anon: the link is followed from the mailbox being claimed, which
-- is frequently not the browser the portal session lives in -- a work address
-- opened on a phone, an address shared with a colleague. Possession of the
-- token is the proof being asked for, and requiring a session as well would
-- reject exactly the case this feature exists to serve without proving anything
-- extra.
--
-- Rate-limited per (route, ip) like every other public entry point: the token
-- is 256 bits of randomness and cannot be guessed, but the limiter is what
-- stops someone trying anyway from writing rows into rate_limit_hits' table all
-- night.
--
-- Returns no rows for an unknown, expired or already-used token. The caller
-- cannot tell those apart, and should not be able to: the page says "this link
-- has expired or has already been used" for all three.
create function public.confirm_notification_email(
  p_token_hash text,
  p_ip_address inet
)
returns table (
  person_id uuid,
  tenant_id uuid,
  confirmed_email text,
  previous_email text,
  display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person public.people;
begin
  if not public.check_rate_limit('confirm_notification_email', p_ip_address, 20, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  -- for update: two clicks on the same link -- a mail client prefetching it and
  -- the person following it -- would otherwise both read a live token and both
  -- promote, sending the "your mail moved" notice twice.
  select * into v_person
    from public.people
   where notification_email_token = p_token_hash
     and notification_email_token_expires_at > now()
     and notification_email_pending is not null
   for update;

  if not found then
    return;
  end if;

  update public.people
     set notification_email = v_person.notification_email_pending,
         notification_email_pending = null
   where id = v_person.id;

  return query
    select
      v_person.id,
      v_person.tenant_id,
      v_person.notification_email_pending,
      -- Where mail was going until this moment, which is who has to be told.
      coalesce(v_person.notification_email, v_person.email),
      coalesce(v_person.preferred_name, v_person.name);
end;
$$;

grant execute on function public.confirm_notification_email(text, inet) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Showing the pending state
-- ---------------------------------------------------------------------------

-- /portal/account has to render "waiting on X until <date>", so the resolver it
-- uses has to return it. An added OUT column is a return-type change rather
-- than a replaceable body, so this drops first -- the third time this dance has
-- been needed (20260905060000, 20260914010000). Body is 20260914010000's
-- verbatim apart from the two columns.
drop function public.ensure_current_person();

create function public.ensure_current_person()
returns table (
  person_id uuid,
  name text,
  preferred_name text,
  pronouns text,
  email text,
  notification_email text,
  notification_email_pending text,
  notification_email_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_email text;
  v_tenant_id uuid := public.current_tenant_id();
begin
  -- No tenant yet (several memberships and no choice made, or none at all):
  -- nothing to create a person *in*. The portal layout shows the chooser or
  -- the no-tenant state instead of a directory record.
  if auth.uid() is null or v_tenant_id is null then
    return;
  end if;

  v_person_id := public.resolve_current_person_id();

  if v_person_id is null then
    begin
      insert into public.people (tenant_id, name, is_anonymous, source_type, email, auth_user_id, created_by)
      select
        v_tenant_id,
        coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email),
        false,
        'other',
        u.email,
        u.id,
        u.id
      from auth.users u
      where u.id = auth.uid()
      returning id into v_person_id;
    exception when unique_violation then
      -- people_auth_user_id_key: a concurrent login won the race.
      select pp.id into v_person_id
        from public.people pp
       where pp.auth_user_id = auth.uid()
         and pp.tenant_id = v_tenant_id;

      if v_person_id is null then
        -- people_email_key: a directory record already holds this address.
        select u.email into v_email from auth.users u where u.id = auth.uid();

        select pp.id into v_person_id
          from public.people pp
         where lower(pp.email) = lower(v_email)
           and pp.tenant_id = v_tenant_id
           and not pp.is_anonymous
           and pp.auth_user_id is null
         order by pp.created_at asc
         limit 1;

        if v_person_id is not null then
          update public.people set auth_user_id = auth.uid() where id = v_person_id;
        else
          raise exception 'A directory record already uses this email address and is linked to a different portal account. An admin can merge the two records at People > Duplicates.';
        end if;
      end if;
    end;
  end if;

  return query
    select
      pp.id,
      pp.name,
      pp.preferred_name,
      pp.pronouns,
      pp.email,
      pp.notification_email,
      pp.notification_email_pending,
      pp.notification_email_token_expires_at
      from public.people pp
     where pp.id = v_person_id;
end;
$$;

grant execute on function public.ensure_current_person() to authenticated;
