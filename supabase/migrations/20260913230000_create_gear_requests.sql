-- #1032: a public gear request becomes a record of its own.
--
-- Until now a visitor's request from the public gear library existed only as
-- one `inventory_movements` row per item (`movement_type = reserved`,
-- `reason = 'Public gear library request'`) plus `inventory_items.status =
-- reserved`. That was enough to hold the items, and nothing else: nobody was
-- told a request had arrived, and there was nowhere to write down how the
-- requester wants the gear -- handed over in person, or posted to an address
-- they pay the postage for -- nor how they intend to pay for that postage.
--
-- Those are facts about one submission, not about one movement. Put on the
-- movement they would be copied once per item in the cart (N addresses to
-- redact, retain and keep consistent), the dashboard bell would need a
-- `distinct on` to count requests, the notifier would have no single id to
-- dedupe on, and a postage quote edited from one item's modal could silently
-- diverge from its siblings. So the submission gets a header row here and the
-- movements point at it. Movements stay what the retention rule already calls
-- them: inventory history.
--
-- Money: the gear itself is a give-away (#599). The only amount anywhere on
-- this table is the postage a requester who chose shipping is quoted by staff
-- after the fact, and whether it has been paid. Payment itself happens outside
-- the system (Zelle, Venmo, whatever the tenant accepts) -- record-only, the
-- same policy as sales (§5.22) and giveaway ticket sales (§5.8). Which methods
-- a tenant accepts, and what it tells a requester about them, are tenant
-- settings (`gear_requests.*` in app_settings), never platform code: Chatter
-- Snow takes Zelle and Venmo; the next tenant may take neither.

-- ---------------------------------------------------------------------------
-- 1. The header
-- ---------------------------------------------------------------------------

create table public.gear_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  -- The requester. Composite FK below; nulled by the retention purge, and by
  -- a people delete, so the request survives as history either way.
  person_id uuid,
  delivery_method text not null
    check (delivery_method in ('shipping', 'meetup')),
  -- One address, flattened rather than jsonb, so the audit redaction and the
  -- retention purge can name the columns they clear.
  ship_name text,
  ship_line1 text,
  ship_line2 text,
  ship_city text,
  ship_region text,
  ship_postal_code text,
  ship_country text,
  -- The key of one of the tenant's configured payment methods. Free text with
  -- a length cap rather than a check against the list, because the list is a
  -- setting: a method the tenant later removes must not make old rows invalid.
  payment_method text check (payment_method is null or length(payment_method) <= 50),
  -- What the requester wrote on the form, about the request as a whole. Was
  -- copied onto every movement (#721); the header is where it belongs.
  notes text,
  -- text + check, never a Postgres enum -- the convention every status column
  -- in this schema follows. `quoted` and `paid` are the postage conversation
  -- and only a shipping request passes through them; a meetup goes straight
  -- from `new` to `fulfilled`.
  status text not null default 'new'
    check (status in ('new', 'quoted', 'paid', 'fulfilled', 'cancelled')),
  quoted_amount numeric(10,2) check (quoted_amount is null or quoted_amount >= 0),
  quoted_at timestamptz,
  paid_at timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  -- Referenced by inventory_movements (tenant_id, gear_request_id).
  unique (tenant_id, id),
  foreign key (tenant_id, person_id)
    references public.people (tenant_id, id) on delete set null (person_id),
  -- A shipping request carries an address and a way to pay for the postage --
  -- unless it has been anonymized, which is the one state where the address
  -- is gone on purpose and the requester link is gone with it.
  constraint gear_requests_shipping_needs_address check (
    delivery_method = 'meetup'
    or person_id is null
    or (
      ship_line1 is not null
      and ship_city is not null
      and ship_postal_code is not null
      and payment_method is not null
    )
  ),
  -- A quote is an amount and a time, together or not at all; likewise the
  -- two terminal stamps and the status they belong to.
  constraint gear_requests_quote_state check ((quoted_amount is null) = (quoted_at is null)),
  constraint gear_requests_terminal_state check (
    (status = 'fulfilled') = (fulfilled_at is not null)
    and (status = 'cancelled') = (cancelled_at is not null)
  )
);

comment on table public.gear_requests is
  'One public gear library request (#1032): who asked, how they want the gear delivered, where to post it, how they intend to pay the postage, and where the postage conversation stands. The items themselves are the reserved inventory_movements pointing here. Written only by request_gear_items(); status moves only through set_gear_request_status().';
comment on column public.gear_requests.payment_method is
  'The key of one of the tenant''s gear_requests.payment_methods entries, chosen by the requester for the postage. Cleared by the gear_requests retention rule.';
comment on column public.gear_requests.quoted_amount is
  'The postage staff quoted, in dollars. Record-only: the money changes hands outside the system.';

create index gear_requests_tenant_id_idx on public.gear_requests (tenant_id);
create index gear_requests_person_id_idx on public.gear_requests (person_id);
-- The queue's default order and the bell's count.
create index gear_requests_status_idx on public.gear_requests (tenant_id, status);
create index gear_requests_created_at_idx on public.gear_requests (created_at desc, id);

create trigger set_updated_at before update on public.gear_requests
  for each row execute function public.set_updated_at();

alter table public.gear_requests enable row level security;

create policy "gear_requests select" on public.gear_requests for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('inventory', 'view')
  );

-- No insert, update or delete policy and no such grant: the public RPC below
-- inserts, set_gear_request_status() updates, and nothing deletes -- a request
-- is history once it exists. The revoke is what does the work; see
-- 20260911040000's note on Supabase's default privileges.
revoke all on public.gear_requests from authenticated, anon;
grant select on public.gear_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The link from each held item to its request
-- ---------------------------------------------------------------------------

alter table public.inventory_movements add column gear_request_id uuid;

alter table public.inventory_movements
  add constraint inventory_movements_gear_request_id_fkey
  foreign key (tenant_id, gear_request_id)
    references public.gear_requests (tenant_id, id) on delete set null (gear_request_id);

create index inventory_movements_gear_request_id_idx
  on public.inventory_movements (gear_request_id);

comment on column public.inventory_movements.gear_request_id is
  'The public gear request this reserved movement belongs to (#1032). Null on manual holds, on movements from before the header existed, and on every other movement type.';

-- ---------------------------------------------------------------------------
-- 3. Audit, with the address kept out of it
-- ---------------------------------------------------------------------------

-- audit_log is retained indefinitely, and a postal address is personal data on
-- a three-year clock. Registered per column (20260905160000), so the trail
-- keeps who asked for what and when, and loses only the address and the
-- requester's own prose.
insert into public.audited_tables (table_name, pk_column, redacted_columns) values
  ('gear_requests', 'id',
   array['ship_name', 'ship_line1', 'ship_line2', 'ship_city', 'ship_region', 'ship_postal_code', 'ship_country', 'notes']);

create trigger audit_log_row after insert or update or delete on public.gear_requests
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 4. Backfill: a header for every hold that is still open
-- ---------------------------------------------------------------------------

-- Only the holds still standing get a header -- an item that is `reserved`
-- today with a public-request movement behind it. History does not: a
-- distributed or released item's old reservation has no queue to sit in, and
-- the portal falls back to the movement for those. A cart's movements were
-- inserted in one transaction, so they share an occurred_at, which is what
-- groups them back into one request.
with grouped as (
  select m.tenant_id,
         m.recipient_person_id,
         m.occurred_at,
         min(m.notes) as notes,
         array_agg(m.id) as movement_ids
    from public.inventory_movements m
    join public.inventory_items i on i.id = m.inventory_item_id
   where m.movement_type = 'reserved'
     and m.reason = 'Public gear library request'
     and m.recipient_person_id is not null
     and m.gear_request_id is null
     and i.status = 'reserved'
   group by m.tenant_id, m.recipient_person_id, m.occurred_at
),
inserted as (
  insert into public.gear_requests (tenant_id, person_id, delivery_method, notes, status, created_at)
  select tenant_id, recipient_person_id, 'meetup', notes, 'new', occurred_at
    from grouped
  returning id, tenant_id, person_id, created_at
)
update public.inventory_movements m
   set gear_request_id = ins.id
  from inserted ins
  join grouped g
    on g.tenant_id = ins.tenant_id
   and g.recipient_person_id = ins.person_id
   and g.occurred_at = ins.created_at
 where m.id = any(g.movement_ids);

-- ---------------------------------------------------------------------------
-- 5. Retention
-- ---------------------------------------------------------------------------

-- Without this, retention_person_is_retained() -- which discovers foreign keys
-- to people from the catalog -- would count every requester as retained by
-- their request, forever.
insert into public.retention_purgeable_person_refs (table_name, column_name) values
  ('gear_requests', 'person_id');

update public.retention_policies
   set description = 'Measured from the handover, or from the cancellation. The request and its inventory movements survive as inventory history; the link to the requester, the shipping address, the payment preference and the request notes are removed.'
 where policy_key = 'gear_requests';

-- run_retention_purge(): body from 20260907150000, the live one, with one
-- block added after rule E (search for "E2."). Everything else -- the advisory
-- lock, rule H, the tenant loop, the person rule -- is unchanged.
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
-- 6. What the public form may know
-- ---------------------------------------------------------------------------

-- Two of the four `gear_requests.*` settings, and not the other two: the form
-- has to know whether shipping is on offer and what the payment choices are
-- called, and nothing else. The handles and the instructions are for the
-- confirmation email, after a person has actually asked -- so unlike the
-- prefix views (#888) this one enumerates its keys and projects the payment
-- list down to key and label.
create or replace view public.public_gear_request_settings as
select 'shipping_enabled'::text as slot,
       coalesce(
         (select s.value
            from public.app_settings s
           where s.tenant_id = public.public_tenant_id()
             and s.key = 'gear_requests.shipping_enabled'
             and jsonb_typeof(s.value) = 'boolean'),
         'false'::jsonb
       ) as value
union all
select 'payment_methods'::text,
       coalesce(
         (select jsonb_agg(jsonb_build_object('key', o.m ->> 'key', 'label', o.m ->> 'label') order by o.ordinality)
            from public.app_settings s
            cross join lateral jsonb_array_elements(s.value) with ordinality as o(m, ordinality)
           where s.tenant_id = public.public_tenant_id()
             and s.key = 'gear_requests.payment_methods'
             and jsonb_typeof(s.value) = 'array'),
         '[]'::jsonb
       );

comment on view public.public_gear_request_settings is
  'What the public gear request form needs of the resolved tenant''s gear_requests.* settings (#1032): whether shipping is offered, and the keys and labels of the payment methods it accepts. Security definer by design (#887): app_settings has no anon policy. Isolation is tenant_id = public_tenant_id() in both arms; the handles and instructions are not selected.';

alter view public.public_gear_request_settings set (security_barrier = true);

grant select on public.public_gear_request_settings to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. The settings, for the portal
-- ---------------------------------------------------------------------------

-- app_settings admits system_settings:manage and the managers of the resources
-- that read it. These four keys shape one feature, so their panel lives with
-- inventory (docs/portal-navigation.md) and inventory:manage is the gate --
-- enforced here rather than by widening the table's policies to yet another
-- resource.

create function public.get_gear_request_settings()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.has_permission('inventory', 'view') then
      jsonb_build_object(
        'shipping_enabled', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'gear_requests.shipping_enabled'
              and jsonb_typeof(s.value) = 'boolean'),
          'false'::jsonb),
        'payment_methods', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'gear_requests.payment_methods'
              and jsonb_typeof(s.value) = 'array'),
          '[]'::jsonb),
        'meetup_instructions', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'gear_requests.meetup_instructions'
              and jsonb_typeof(s.value) = 'string'),
          '""'::jsonb),
        'shipping_instructions', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'gear_requests.shipping_instructions'
              and jsonb_typeof(s.value) = 'string'),
          '""'::jsonb)
      )
    else null
  end;
$$;

comment on function public.get_gear_request_settings() is
  'The current tenant''s gear_requests.* settings for the Requests page (#1032), or null without inventory:view.';

revoke execute on function public.get_gear_request_settings() from public, anon;
grant execute on function public.get_gear_request_settings() to authenticated;

create function public.set_gear_request_settings(
  p_shipping_enabled boolean,
  p_payment_methods jsonb,
  p_meetup_instructions text,
  p_shipping_instructions text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_method jsonb;
  v_keys text[] := '{}';
  v_key text;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_tenant_id is null then
    raise exception 'PERMISSION_DENIED';
  end if;

  -- Shape check on the list, since it is what the public RPC validates a
  -- request's choice against: an array of {key, label, handle, instructions},
  -- keys short, slug-like and unique, labels present.
  if p_payment_methods is null or jsonb_typeof(p_payment_methods) <> 'array' then
    raise exception 'PAYMENT_METHODS_INVALID';
  end if;
  for v_method in select * from jsonb_array_elements(p_payment_methods)
  loop
    if jsonb_typeof(v_method) <> 'object' then
      raise exception 'PAYMENT_METHODS_INVALID';
    end if;
    v_key := v_method ->> 'key';
    if v_key is null or v_key !~ '^[a-z0-9][a-z0-9_-]{0,49}$' or v_key = any(v_keys) then
      raise exception 'PAYMENT_METHODS_INVALID';
    end if;
    if nullif(btrim(coalesce(v_method ->> 'label', '')), '') is null
       or length(v_method ->> 'label') > 60
       or length(coalesce(v_method ->> 'handle', '')) > 120
       or length(coalesce(v_method ->> 'instructions', '')) > 1000 then
      raise exception 'PAYMENT_METHODS_INVALID';
    end if;
    v_keys := array_append(v_keys, v_key);
  end loop;
  if length(coalesce(p_meetup_instructions, '')) > 2000
     or length(coalesce(p_shipping_instructions, '')) > 2000 then
    raise exception 'INSTRUCTIONS_TOO_LONG';
  end if;

  insert into public.app_settings (tenant_id, key, value, updated_by)
  values
    (v_tenant_id, 'gear_requests.shipping_enabled', to_jsonb(coalesce(p_shipping_enabled, false)), auth.uid()),
    (v_tenant_id, 'gear_requests.payment_methods', p_payment_methods, auth.uid()),
    (v_tenant_id, 'gear_requests.meetup_instructions', to_jsonb(btrim(coalesce(p_meetup_instructions, ''))), auth.uid()),
    (v_tenant_id, 'gear_requests.shipping_instructions', to_jsonb(btrim(coalesce(p_shipping_instructions, ''))), auth.uid())
  on conflict (tenant_id, key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

comment on function public.set_gear_request_settings(boolean, jsonb, text, text) is
  'Writes the current tenant''s four gear_requests.* settings (#1032). Gated on inventory:manage rather than system_settings:manage, because the panel lives with the feature.';

revoke execute on function public.set_gear_request_settings(boolean, jsonb, text, text) from public, anon;
grant execute on function public.set_gear_request_settings(boolean, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Moving a request along
-- ---------------------------------------------------------------------------

-- One write path, so a quote is always an amount and a stamp together, a
-- cancellation always frees the items it was holding, and a closed request
-- stays closed. Authorization is re-checked here rather than trusted from the
-- server action, matching set_retention_policy_mode() and merge_people().
create function public.set_gear_request_status(
  p_request_id uuid,
  p_status text,
  p_quoted_amount numeric default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_request public.gear_requests%rowtype;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select * into v_request
    from public.gear_requests
   where id = p_request_id
     and tenant_id = v_tenant_id
   for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if v_request.status in ('fulfilled', 'cancelled') then
    raise exception 'REQUEST_CLOSED';
  end if;

  if p_status = 'quoted' then
    if v_request.delivery_method <> 'shipping' then
      raise exception 'NOT_SHIPPING';
    end if;
    if p_quoted_amount is null or p_quoted_amount < 0 then
      raise exception 'QUOTE_AMOUNT_REQUIRED';
    end if;
    update public.gear_requests
       set status = 'quoted',
           quoted_amount = p_quoted_amount,
           quoted_at = now(),
           paid_at = null,
           updated_by = auth.uid()
     where id = p_request_id;

  elsif p_status = 'paid' then
    if v_request.delivery_method <> 'shipping' then
      raise exception 'NOT_SHIPPING';
    end if;
    if v_request.quoted_at is null then
      raise exception 'QUOTE_REQUIRED';
    end if;
    update public.gear_requests
       set status = 'paid',
           paid_at = now(),
           updated_by = auth.uid()
     where id = p_request_id;

  elsif p_status = 'fulfilled' then
    update public.gear_requests
       set status = 'fulfilled',
           fulfilled_at = now(),
           updated_by = auth.uid()
     where id = p_request_id;

  elsif p_status = 'cancelled' then
    update public.gear_requests
       set status = 'cancelled',
           cancelled_at = now(),
           updated_by = auth.uid()
     where id = p_request_id;

    -- Whatever this request was still holding goes back on the shelf. An item
    -- already handed over (distributed) or otherwise moved on is left alone.
    update public.inventory_items i
       set status = 'available',
           updated_by = auth.uid()
     where i.tenant_id = v_tenant_id
       and i.status = 'reserved'
       and i.id in (
         select m.inventory_item_id
           from public.inventory_movements m
          where m.gear_request_id = p_request_id
            and m.movement_type = 'reserved'
       );

  else
    raise exception 'STATUS_INVALID';
  end if;
end;
$$;

comment on function public.set_gear_request_status(uuid, text, numeric) is
  'The one write path for a gear request''s status (#1032): quoted (shipping only, with the postage amount), paid (after a quote), fulfilled, or cancelled (which releases the items it still holds). Refuses once fulfilled or cancelled.';

revoke execute on function public.set_gear_request_status(uuid, text, numeric) from public, anon;
grant execute on function public.set_gear_request_status(uuid, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. The public request path
-- ---------------------------------------------------------------------------

-- Body from 20260911000000, which is the live one (module gating). Three
-- parameters appended, and the return changes from the movement ids to the
-- one request id -- which is what the notifier and the confirmation email key
-- on -- so this is a drop and a create rather than a replace. Callers pass
-- named parameters; the old ones keep their defaults.
drop function public.request_gear_items(uuid[], text, text, text, text, text, inet);

create function public.request_gear_items(
  p_inventory_item_ids uuid[],
  p_name text,
  p_email text,
  p_phone text,
  p_notes text default null,
  p_honeypot text default null,
  p_ip_address inet default null,
  p_delivery_method text default 'meetup',
  p_shipping jsonb default null,
  p_payment_method text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_status text;
  v_person_id uuid;
  v_request_id uuid;
  v_notes text := nullif(btrim(p_notes), '');
  v_tenant_id uuid := public.public_tenant_id();
  v_delivery text := coalesce(nullif(btrim(p_delivery_method), ''), 'meetup');
  v_shipping_enabled boolean;
  v_payment_method text := nullif(btrim(coalesce(p_payment_method, '')), '');
  v_ship_name text;
  v_ship_line1 text;
  v_ship_line2 text;
  v_ship_city text;
  v_ship_region text;
  v_ship_postal_code text;
  v_ship_country text;
begin
  if not public.check_rate_limit('request_gear_items', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  -- #902
  if not public.module_enabled_for_tenant(v_tenant_id, 'inventory') then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  if p_inventory_item_ids is null or array_length(p_inventory_item_ids, 1) is null then
    raise exception 'NO_ITEMS';
  end if;

  if v_delivery not in ('shipping', 'meetup') then
    raise exception 'DELIVERY_METHOD_INVALID';
  end if;

  if v_delivery = 'shipping' then
    -- The form only offers shipping when the tenant has turned it on, so
    -- reaching here without it is a stale tab or a hand-crafted call.
    select (s.value = 'true'::jsonb) into v_shipping_enabled
      from public.app_settings s
     where s.tenant_id = v_tenant_id
       and s.key = 'gear_requests.shipping_enabled';
    if not coalesce(v_shipping_enabled, false) then
      raise exception 'SHIPPING_UNAVAILABLE';
    end if;

    v_ship_name := left(nullif(btrim(coalesce(p_shipping ->> 'name', '')), ''), 200);
    v_ship_line1 := left(nullif(btrim(coalesce(p_shipping ->> 'line1', '')), ''), 200);
    v_ship_line2 := left(nullif(btrim(coalesce(p_shipping ->> 'line2', '')), ''), 200);
    v_ship_city := left(nullif(btrim(coalesce(p_shipping ->> 'city', '')), ''), 120);
    v_ship_region := left(nullif(btrim(coalesce(p_shipping ->> 'region', '')), ''), 120);
    v_ship_postal_code := left(nullif(btrim(coalesce(p_shipping ->> 'postal_code', '')), ''), 20);
    v_ship_country := left(nullif(btrim(coalesce(p_shipping ->> 'country', '')), ''), 80);

    if v_ship_line1 is null or v_ship_city is null or v_ship_postal_code is null then
      raise exception 'SHIPPING_ADDRESS_REQUIRED';
    end if;

    if v_payment_method is null or not exists (
      select 1
        from public.app_settings s
        cross join lateral jsonb_array_elements(s.value) m
       where s.tenant_id = v_tenant_id
         and s.key = 'gear_requests.payment_methods'
         and jsonb_typeof(s.value) = 'array'
         and m ->> 'key' = v_payment_method
    ) then
      raise exception 'PAYMENT_METHOD_INVALID';
    end if;
  else
    -- A meetup carries no address and no payment: nothing to pay for.
    v_payment_method := null;
  end if;

  for v_item_id in select unnest(p_inventory_item_ids) order by 1
  loop
    select status into v_status
    from public.inventory_items
    where id = v_item_id
      and tenant_id = v_tenant_id
      and intended_use = 'gear_library'
    for update;

    if not found then
      raise exception 'ITEM_NOT_FOUND';
    end if;

    if v_status <> 'available' then
      raise exception 'ITEM_ALREADY_REQUESTED';
    end if;
  end loop;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', null, null, null, v_tenant_id
  );

  insert into public.gear_requests
    (tenant_id, person_id, delivery_method, ship_name, ship_line1, ship_line2, ship_city,
     ship_region, ship_postal_code, ship_country, payment_method, notes)
  values
    (v_tenant_id, v_person_id, v_delivery, v_ship_name, v_ship_line1, v_ship_line2, v_ship_city,
     v_ship_region, v_ship_postal_code, v_ship_country, v_payment_method, v_notes)
  returning id into v_request_id;

  foreach v_item_id in array p_inventory_item_ids
  loop
    -- notes stay on the header now; the movement is the hold and nothing more.
    insert into public.inventory_movements
      (tenant_id, inventory_item_id, movement_type, quantity, reason, recipient_person_id, gear_request_id)
    values
      (v_tenant_id, v_item_id, 'reserved', 1, 'Public gear library request', v_person_id, v_request_id);

    update public.inventory_items set status = 'reserved'
     where id = v_item_id and tenant_id = v_tenant_id;
  end loop;

  return v_request_id;
end;
$$;

comment on function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text) is
  'The public gear library cart (#247, #1032): reserves every item all-or-nothing and records one gear_requests header carrying the delivery method, the shipping address and the postage payment preference. Returns the request id; a filled honeypot returns a fresh uuid with no row behind it.';

grant execute on function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text) to anon, authenticated;
