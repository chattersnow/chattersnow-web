-- Messaging a person from the portal: one-off staff messages and resent
-- receipts (#1203).
--
-- Every email this application sends is triggered by something other than a
-- person -- a public form submit (#742), an account change (#1164), a cron
-- (#488, #743). The plumbing underneath is audience-agnostic already, but
-- nothing is triggered by a staffer deciding to write to somebody. On a gear
-- request that means the requester's address is text to copy into a personal
-- mail client, so the conversation that decides the request happens off the
-- platform and the record keeps none of it.
--
-- `outbound_messages` is the record of a person-triggered send. It is
-- deliberately polymorphic -- `module`, `record_type`, `record_id` -- because
-- #1204 hangs the same primitive off volunteer applications and contact
-- messages without a second migration, and `person_id` is nullable because
-- `contact_messages` (20260826180000) carries an address and no people row.
--
-- Three things this table is not:
--
--   * Not a mailbox. Replies go to the tenant's Reply-To (Zoho), not back into
--     the app. The composer says so.
--   * Not a mailing tool. One recipient at a time, no audience picker, no
--     attachments. Resend's free plan is 100 emails a day; anything
--     broadcast-shaped is a different feature with a different plan behind it.
--   * Not a notification kind. `staff_message` is absent from
--     NOTIFICATION_KINDS (src/lib/notifications/kinds.ts) on purpose, like
--     `ops_report` and `gear_request_confirmation`: hasOptedOut() only consults
--     person_notification_preferences for a kind with a registered default, so
--     an unregistered kind is never suppressed. A reply about a request
--     somebody made themselves is correspondence, not a subscription, and
--     staff must be able to answer a person who switched their receipts off.
--     The org-wide kill switch still stops it.

-- ---------------------------------------------------------------------------
-- 1. The messages
-- ---------------------------------------------------------------------------

create table public.outbound_messages (
  -- Supplied by the caller, never defaulted. The composer mints it when the
  -- dialog opens and sends it with the form, so a double-click or a retried
  -- Server Action loses the notification_deliveries unique-constraint race and
  -- sends nothing -- the same guarantee an event-triggered send gets from the
  -- id of the row that triggered it. It collides here too, which is the
  -- backstop if the ledger row is ever cleaned up ahead of this one.
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  person_id uuid,
  to_email text not null,
  -- A has_permission() resource key, e.g. 'inventory'. It is what the read
  -- policy is evaluated against, so a message's audience is the managers of
  -- the module its record belongs to and nothing wider.
  module text not null,
  record_type text not null,
  -- Deliberately no foreign key: the record is of whatever type the module
  -- says. The index below is what makes the detail view's lookup cheap.
  record_id uuid not null,
  subject text not null check (length(subject) <= 200),
  body text not null check (length(body) <= 5000),
  -- 'staff_message', or the receipt kind a resend re-sent.
  kind text not null,
  -- The outcome deliverEmail() returned, copied here rather than joined from
  -- notification_deliveries, which is readable only by an administration
  -- manager (20260906140000). An inventory manager has to be able to see
  -- whether their own message went out. Two things this column means exactly:
  -- 'skipped' is never stored, because nothing was sent and no row is written;
  -- and it is the outcome at send time, so a finalize failure that leaves the
  -- ledger at 'pending' still reads 'sent' here, which is the ledger's job to
  -- contradict.
  status text not null check (status in ('sent', 'failed')),
  -- The staffer who wrote it. Passed explicitly by the action: the insert runs
  -- on the service-role client where auth.uid() is null, so audit_log_row()
  -- stamps a null actor on this row too -- which makes this column the only
  -- record of who sent the message.
  sent_by uuid references auth.users(id),
  delivery_id uuid,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  -- Composite, like every other reference between two tenant tables
  -- (20260906080000). `set null (<column>)` rather than the bare form, which
  -- would try to null tenant_id too and fail its not-null constraint.
  --
  -- set null, not cascade, on both: notification_deliveries cascades from
  -- people, so a deleted person would otherwise take the message history with
  -- it through delivery_id -- and the history of what was said to somebody is
  -- exactly what survives them being removed from the directory.
  foreign key (tenant_id, person_id)
    references public.people (tenant_id, id) on delete set null (person_id),
  foreign key (tenant_id, delivery_id)
    references public.notification_deliveries (tenant_id, id) on delete set null (delivery_id)
);

comment on table public.outbound_messages is
  'One row per email a staff member caused to be sent to a person (#1203): a one-off message, or a receipt resent by hand. Polymorphic over the record it is about; read by the managers of that record''s module. Written only by the service-role sender.';

comment on column public.outbound_messages.module is
  'A has_permission() resource key. The read policy is evaluated against it, so this column decides who can read the message.';

comment on column public.outbound_messages.status is
  'The outcome at send time: sent or failed. A skipped send writes no row at all, because nothing went out.';

-- The record detail's own query: every message about one record, newest first.
create index outbound_messages_record_idx
  on public.outbound_messages (tenant_id, record_type, record_id, created_at desc);
-- The retention sweep and the person-is-retained walk.
create index outbound_messages_person_id_idx
  on public.outbound_messages (person_id);

-- No set_updated_at trigger, and so no updated_by column: this is an
-- append-only record of something that already happened, same shape as
-- notification_deliveries.

alter table public.outbound_messages enable row level security;

-- Data-driven, so a new record type needs no policy. has_permission() takes
-- the row's own module, which means it is evaluated per row rather than once
-- as an InitPlan the way the tenant predicate is -- its argument varies by
-- row, so there is nothing to hoist. The index above does the filtering first
-- and a record's history is a handful of rows.
create policy "outbound_messages select" on public.outbound_messages for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission(module, 'manage')
  );

-- No insert, update or delete policy for authenticated at all. Every row is
-- written by the service-role sender, which RLS does not apply to; a signed-in
-- session has no legitimate reason to forge one, and a forged row is a claim
-- that the organization said something it did not say. Same argument as
-- notification_deliveries (20260906140000).
grant select on public.outbound_messages to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Audit, without the correspondence in it
-- ---------------------------------------------------------------------------

-- audit_log is retained indefinitely and this table is on a two-year clock, so
-- the trail records that a message went out -- when, by whom, about which
-- record, and whether the provider took it -- and never what it said. Per
-- column, as 20260905160000 made possible.
insert into public.audited_tables (table_name, pk_column, redacted_columns) values
  ('outbound_messages', 'id', array['subject', 'body', 'to_email']);

create trigger audit_log_row after insert or update or delete on public.outbound_messages
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 3. Who sent it
-- ---------------------------------------------------------------------------

-- sent_by is an auth.users id, which no session can read. The house answer is
-- a narrow security definer lookup over exactly the ids the caller asks for
-- (list_expense_actors, 20260830130000) -- but the gate cannot be a hard-coded
-- resource here, because #1204 adds volunteers and communications callers. So
-- the gate is the message row's own module, the same predicate its select
-- policy uses: you can put a name to a send exactly when you could read the
-- send. No module list to keep in step, and no way to enumerate accounts.
create function public.list_outbound_message_actors(p_message_ids uuid[])
returns table (
  user_id uuid,
  email text,
  full_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select distinct u.id, u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
  join public.outbound_messages m on m.sent_by = u.id
  where m.id = any(p_message_ids)
    and m.tenant_id = (select public.current_tenant_id())
    and public.has_permission(m.module, 'manage')
$$;

comment on function public.list_outbound_message_actors(uuid[]) is
  'Names for the senders of the given messages (#1203), gated on each row''s own module so #1204''s modules need no second function.';

revoke execute on function public.list_outbound_message_actors(uuid[]) from public;
grant execute on function public.list_outbound_message_actors(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The Reply-To address, for the composer
-- ---------------------------------------------------------------------------

-- The dialog tells the staffer where a reply will land, because the whole
-- design rests on replies leaving the platform. app_settings' select policy
-- admits only the managers of five other resources (20260906040000), so an
-- inventory manager cannot read notifications.reply_to -- the same gap
-- org_notification_settings already exists to close for the kill switch, so
-- widen that view rather than adding a second one.
--
-- Two consequences worth stating. The view now aggregates, so it returns one
-- row where it used to return zero or one; getOrgEmailEnabled() reads it with
-- maybeSingle() and maps a null to the registry default, so its behaviour is
-- unchanged. And reply_to is now readable by every signed-in member of the
-- tenant: it is the address on the bottom of every email the organization
-- sends, and it is the tenant's own setting only -- the platform's EMAIL_REPLY_TO
-- fallback stays where it is, in the server's environment.
create or replace view public.org_notification_settings as
select
  max(case when s.key = 'notifications.email_enabled' then s.value #>> '{}' end)::boolean as email_enabled,
  max(case when s.key = 'notifications.reply_to' then s.value #>> '{}' end) as reply_to
from public.app_settings s
where s.tenant_id = public.current_tenant_id()
  and s.key in ('notifications.email_enabled', 'notifications.reply_to');

comment on view public.org_notification_settings is
  'The current tenant''s outbound email kill switch and Reply-To address, so /portal/account can explain why an enabled toggle is sending nothing and the message composer (#1203) can say where a reply will land. Security definer by design (#887): the reasoning is written out at 20260906140000_notification_preferences_and_deliveries.sql:205 -- every member needs the answer, not only the `manage` holders. Isolation is tenant_id = current_tenant_id().';

grant select on public.org_notification_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Retention
-- ---------------------------------------------------------------------------

-- Without this, retention_person_is_retained() -- which discovers references to
-- people from the catalog -- would count everyone ever written to as retained
-- by the message, forever.
insert into public.retention_purgeable_person_refs (table_name, column_name) values
  ('outbound_messages', 'person_id');

-- A clock of its own rather than the clock of whatever record the message is
-- about, for three reasons: the table is polymorphic, so inheriting the
-- record's rule would mean a join per record_type that #1204 edits again for
-- every module it adds; a gear request's clock runs from the handover while a
-- message's runs from the day it was sent; and message correspondence is
-- exactly the kind of thing an administrator may want to purge on a tighter
-- schedule than the operational history it hangs off.
--
-- Two years is the shortest period any record a message can point at carries
-- (contact_messages, volunteer_applications), so a message never outlives its
-- subject. dry_run like every other rule on the day it ships.
--
-- tenant_id named rather than defaulted: default_tenant_id() resolves through
-- current_tenant_id(), which is null in a migration, so the hosted project's
-- tenants would each get a row belonging to none of them (20260909040000).
-- New tenants inherit through seed_tenant_retention_policies() (20260906160000).
--
-- Not added to src/lib/retention.ts: that list is the board-approved published
-- policy the privacy page renders, and publishing this one is a board
-- amendment, not a migration. artwork_submissions, pending_role_grants and
-- rate_limit_hits are already database-only in the same way.
insert into public.retention_policies (tenant_id, policy_key, label, period, mode, description)
select t.id, 'outbound_messages', 'Messages sent to a person', interval '2 years', 'dry_run',
       'Measured from the date the message was sent. The record that a message went out -- when, by whom, about which record, and whether it was delivered -- survives; the recipient link, the address, the subject and the body are cleared.'
  from public.tenants t;

-- run_retention_purge(): the body from 20260913230000, the live one, with one
-- block added at the end of the tenant loop (search for "K."). Everything else
-- -- the advisory lock, rule H, the tenant loop, the person rule -- is
-- unchanged. Re-emitted in full because the function is one plpgsql block, so
-- adding a rule is a rewrite rather than a patch; the signature is unchanged,
-- so `create or replace` is enough and the pg_cron entry (20260905140000)
-- keeps resolving to this one.
create or replace function public.run_retention_purge(
  p_dry_run boolean default true,
  p_as_of timestamptz default now(),
  p_trigger text default 'cron',
  p_tenant_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
    -- event safe. party_size, checked_in_at and the three *_at_event snapshot
    -- columns survive untouched: they are the impact figures this rule exists to
    -- preserve.
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
                  or r.instagram_handle is not null or r.pronouns is not null)
        );
        perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.event_registrations
             set name = 'Removed',
                 email = '',
                 phone = null,
                 notes = null,
                 instagram_handle = null,
                 pronouns = null,
                 person_id = null
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
$$;

-- ---------------------------------------------------------------------------
-- 6. Self-check
-- ---------------------------------------------------------------------------

-- The same check 20260906140000 runs: the new table may not have a policy that
-- forgets the tenant, which on a table read through a data-driven module
-- predicate would be a cross-tenant read of somebody else's correspondence.
do $check$
declare
  v_missing text;
begin
  select string_agg(policyname, ', ') into v_missing
    from pg_policies
   where schemaname = 'public'
     and tablename = 'outbound_messages'
     and coalesce(qual, '') !~ 'tenant_id'
     and coalesce(with_check, '') !~ 'tenant_id';
  if v_missing is not null then
    raise exception 'policies without a tenant predicate: %', v_missing;
  end if;
end;
$check$;
