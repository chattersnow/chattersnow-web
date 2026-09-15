-- Your own history, read as yourself (#1163, epic #1160).
--
-- `/portal/people/[id]` already assembles all of this for staff. What is new
-- here is not the query but the access path: a constituent holds no
-- permissions, no role and no tenant membership, and every one of the tables
-- below is RLS-gated on a `view` or `manage` permission they will never have.
-- Reading your own giving through `finance:view` is not a thing that can be
-- arranged, so the reader is a set of security definer functions instead, one
-- per section, each scoped to the caller's own `people` row.
--
-- **The scoping is in the function, never in the caller.** Not one of these
-- takes a person, an account or a tenant as an argument, so there is no
-- parameter to tamper with: the row set is decided entirely by `auth.uid()`
-- and the request host. That is what the integration test signs in twice to
-- prove.
--
-- Deliberately *not* built by relaxing the portal's policies. Two readers, two
-- paths, one set of underlying tables -- widening `inventory:view` so that a
-- recipient could read their own handovers would hand every recipient the
-- whole gear library.
--
-- What each section returns is the constituent-facing shape, which is narrower
-- than the staff one on purpose: no internal notes, no approver, no reason
-- codes, nothing the retention purge exists to clear. A person needs enough to
-- recognize their own record, not every column a staffer sees.

-- ---------------------------------------------------------------------------
-- 1. Entitlement, resolved from the host
-- ---------------------------------------------------------------------------

-- `tenant_module_enabled()` (#900) answers for `current_tenant_id()`, which is
-- membership-based and null for a constituent. This is its public-site
-- sibling, over the view that already resolves modules from the request host.
--
-- Fails open on an unknown key, the same direction `module_enabled_for_tenant`
-- fails and for the same reason: a missing row means a tenant predates the
-- table, not that the tenant is unentitled. It cannot apply to the keys used
-- below, all of which are in the catalog.
create function public.public_module_enabled(p_module_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select m.enabled
       from public.public_tenant_modules m
      where m.module_key = p_module_key),
    true
  );
$$;

comment on function public.public_module_enabled(text) is
  'Whether the tenant the request host resolves to is entitled to one module (#1163). The public-site counterpart of tenant_module_enabled(), which answers for current_tenant_id() and is therefore null for a visitor and for a constituent.';

grant execute on function public.public_module_enabled(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The tenant's words, on the public site
-- ---------------------------------------------------------------------------

-- `tenant_person_role_labels` (#911) said it was "not a public_ sibling: no
-- public page names a person role", and named `public_lexicon` as the
-- precedent for adding one when a public surface needed it. This is that
-- surface: `/my` heads a section with what the organization calls its
-- volunteers, and there is no session-resolved tenant to read the words
-- through.
--
-- One enumerated key rather than a prefix, so it adds nothing to the reserved
-- namespaces in `src/lib/public-namespaces.ts` -- there is no `people.%` match
-- here that some future private setting could land under by accident.
--
-- `authenticated` only, unlike the rest of the `public_*` family. Nothing
-- signed out names a person role today; `anon` can be added the day something
-- does.
create or replace view public.public_person_role_labels as
select value as labels
from public.app_settings
where key = 'people.role_labels'
  and tenant_id = public.public_tenant_id();

grant select on public.public_person_role_labels to authenticated;

-- SELECT and nothing else, for the reason 20260912030000 gives: a definer view
-- over a simple body is auto-updatable, and the hosted project auto-grants ALL
-- on a new entity in `public` -- which would be a write into any tenant's
-- app_settings with no RLS in the way.
revoke insert, update, delete on public.public_person_role_labels
  from anon, authenticated;

comment on view public.public_person_role_labels is
  'The host tenant''s words for the seven person roles, for the constituent area (#1163). The host-resolved sibling of tenant_person_role_labels; security definer by design (#887), isolated by tenant_id = public_tenant_id() over the single people.role_labels key.';

-- ---------------------------------------------------------------------------
-- 3. Whose history, and whether to serve it at all
-- ---------------------------------------------------------------------------

-- The one gate every section below opens with: the caller's own `people.id`,
-- but only when this tenant has the constituent area *and* the module that
-- owns the section.
--
-- The module check is here rather than only on the page because a page is not
-- what stops a request (#902): these RPCs are reachable with curl by anyone
-- holding a session, and "the tenant turned Finance off" has to mean the rows
-- do not come back, not that the section is hidden.
--
-- Null is the answer to every failure -- no session, no link, module off, area
-- off -- and each section returns no rows for it. There is nothing to tell
-- apart: a constituent whose tenant has just switched Inventory off is in the
-- same position as one who has never been handed anything.
create function public.my_history_person_id(p_module_key text)
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
     and public.public_module_enabled(p_module_key)
   limit 1;
$$;

comment on function public.my_history_person_id(text) is
  'The caller''s people.id on this host, or null when the constituent area or the named module is off for the tenant (#1163). The gate every my_*_history() function opens with.';

revoke execute on function public.my_history_person_id(text) from public, anon;
grant execute on function public.my_history_person_id(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Events
-- ---------------------------------------------------------------------------

-- Registrations, and whether each was checked in. There is no separate
-- attendance table: `event_registrations.checked_in_at` is the whole record of
-- turning up, which is why `attended` is derived here rather than joined.
--
-- Ordered newest-first by the event's own start. The page splits that into
-- upcoming and past -- upcoming first, because a person opening this on a
-- phone is usually checking where they are meant to be on Saturday.
--
-- `timezone` comes back because an event is displayed in its own zone on the
-- public site (#1057), and the browser cannot work that out from the instant.
create function public.my_event_history()
returns table (
  registration_id uuid,
  event_id uuid,
  event_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  location text,
  party_size integer,
  attended boolean,
  registered_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select r.id,
         e.id,
         e.name,
         e.starts_at,
         e.ends_at,
         e.timezone,
         e.location,
         r.party_size,
         r.checked_in_at is not null,
         r.created_at
    from public.event_registrations r
    join public.events e on e.id = r.event_id
   where r.person_id = public.my_history_person_id('events')
   order by e.starts_at desc, r.created_at desc;
$$;

comment on function public.my_event_history() is
  'The caller''s own event registrations (#1163). Takes no arguments: the person is auth.uid() on the request host, so there is nothing to ask for but your own.';

revoke execute on function public.my_event_history() from public, anon;
grant execute on function public.my_event_history() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Volunteering
-- ---------------------------------------------------------------------------

-- Three record sets in one function, because they are one thing to the person
-- who did them -- an application with no hours behind it yet is still
-- volunteering -- and because the page totals hours across them. The portal's
-- card makes the same call for the same reason.
--
-- The `kind` column discriminates, and each row fills only the columns its
-- kind has. Two date columns rather than one: an application is an instant and
-- logged hours are a day (a `date`, the tenant's own day), and collapsing them
-- would mean inventing a time of day for an entry that never had one.
--
-- A sign-up's `occurred_at` is the event's start rather than the row's
-- `created_at`. What a volunteer wants from this list is when they are
-- working, not when they put their name down.
--
-- Role follows `signupRoleLabel`'s precedence in `src/lib/volunteer-roles.ts`:
-- the shift's role type, else the sign-up's own, else the free text that
-- predates both. Logged hours often carry no role type at all -- the event
-- editor's dialog has no role field, and every row backfilled by
-- 20260904010000 landed null -- so they fall back to what this person signed
-- up as for that same event, which is what the portal card does in TypeScript.
create function public.my_volunteer_history()
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

   order by 1, 3 desc nulls last, 4 desc nulls last;
$$;

comment on function public.my_volunteer_history() is
  'The caller''s own volunteer applications, event sign-ups and logged hours (#1163), discriminated by `kind`. One function because they are one activity to the person who did them.';

revoke execute on function public.my_volunteer_history() from public, anon;
grant execute on function public.my_volunteer_history() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Giving
-- ---------------------------------------------------------------------------

-- Money and goods, which are two tables and two modules: `monetary_donations`
-- belongs to Finance and `donations` to Inventory, so a tenant running a gear
-- library without fundraising serves the second half of this and none of the
-- first. Each arm therefore asks `my_history_person_id()` for its own module,
-- which is why they cannot share one gate.
--
-- What a gear donation was is the items it brought in, so those come back as
-- their descriptions. `donations.notes` does not: it is staff prose about a
-- drop-off, not the donor's own words.
create function public.my_giving_history()
returns table (
  kind text,
  id uuid,
  received_on date,
  amount numeric,
  items text[],
  event_id uuid,
  event_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select 'monetary'::text, d.id, d.received_date, d.amount, null::text[],
         d.event_id, e.name
    from public.monetary_donations d
    left join public.events e on e.id = d.event_id
   where d.donor_id = public.my_history_person_id('finance')

  union all
  select 'in_kind'::text, d.id, d.donated_at, null::numeric,
         (select array_agg(i.description order by i.description)
            from public.inventory_items i
           where i.donation_id = d.id),
         d.event_id, e.name
    from public.donations d
    left join public.events e on e.id = d.event_id
   where d.donor_id = public.my_history_person_id('inventory')

   order by 3 desc, 1, 2;
$$;

comment on function public.my_giving_history() is
  'The caller''s own giving (#1163): monetary donations under the Finance module, in-kind donations and the items they brought in under Inventory. Each arm is gated on its own module, so a tenant that runs one and not the other serves only that half.';

revoke execute on function public.my_giving_history() from public, anon;
grant execute on function public.my_giving_history() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Gear
-- ---------------------------------------------------------------------------

-- What you asked for, and what you were actually handed. Two kinds, never
-- merged: the reasoning §5.9 gives for the staff card holds twice over for the
-- person waiting -- an open request must not read as a receipt.
--
-- `received` is `distributed` movements only. A `reserved` one is the gear
-- library holding stock against an open request, which is inventory's own
-- bookkeeping rather than something that happened to the person; the items it
-- covers are already named on the request itself.
--
-- `note` is the requester's own note from the public form, theirs to read
-- back. `inventory_movements.reason` and `.notes` are not: staff write those
-- about the movement.
--
-- §5.9 gives the recipient role no segment, no badge and no browsable list,
-- because a roster of aid beneficiaries is the most sensitive data in this
-- schema. Showing a person their own row is the opposite disclosure -- and
-- what keeps it that way is `my_history_person_id()`, which no caller can
-- widen.
create function public.my_gear_history()
returns table (
  kind text,
  id uuid,
  occurred_at timestamptz,
  status text,
  delivery_method text,
  quoted_amount numeric,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  note text,
  items text[],
  quantity integer
)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select public.my_history_person_id('inventory') as person_id
  )
  select 'request'::text, r.id, r.created_at, r.status, r.delivery_method,
         r.quoted_amount, r.fulfilled_at, r.cancelled_at, r.notes,
         (select array_agg(distinct i.description)
            from public.inventory_movements m
            join public.inventory_items i on i.id = m.inventory_item_id
           where m.gear_request_id = r.id),
         null::integer
    from public.gear_requests r
   where r.person_id = (select person_id from me)

  union all
  select 'received'::text, m.id, m.occurred_at, null::text, null::text,
         null::numeric, null::timestamptz, null::timestamptz, null::text,
         array_remove(array[i.description], null),
         m.quantity
    from public.inventory_movements m
    left join public.inventory_items i on i.id = m.inventory_item_id
   where m.recipient_person_id = (select person_id from me)
     and m.movement_type = 'distributed'

   order by 3 desc, 1, 2;
$$;

comment on function public.my_gear_history() is
  'The caller''s own gear requests and the items handed over to them (#1163), discriminated by `kind`. Requests and handovers are separate rows on purpose: a pending request is not a receipt.';

revoke execute on function public.my_gear_history() from public, anon;
grant execute on function public.my_gear_history() to authenticated;
