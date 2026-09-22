-- #1390: donation provenance and CSV reconciliation.
--
-- Split out of #42 with #1389. #1389 gave a tenant somewhere for a gift to be
-- made -- a link to whichever hosted form it uses. This is the other half:
-- getting what that form collected back into `monetary_donations` without a
-- treasurer retyping it, which is provider-agnostic work that no tenant's
-- processor choice gates.
--
-- WHAT THE TABLE COULD NOT RECORD. 20260829100000 built
-- `monetary_donations` for somebody typing in cash and checks: donor, event,
-- amount, method, received_date, notes. Three things go missing the moment a
-- row's origin is a processor rather than a person.
--
--   1. Where the row came from. Nothing distinguished a hand-entered gift
--      from an imported one, so no import could be re-run safely and no
--      reader could tell which figures were transcribed.
--   2. The gross/fee split, which differs by platform in a way one column
--      cannot express. Zeffy and Givebutter (tips on) pass the cost to the
--      donor, so a $100 gift deposits $100. Donorbox deducts ~2.95% platform
--      plus Stripe's 2.2% + 30c, so the same $100 gift deposits about $94.55.
--      A single `amount` column therefore means something different per
--      tenant, and a tenant that switches providers silently changes what its
--      own history means.
--   3. The instant a processor reports. `received_date` is a date; a
--      processor timestamps to the second, in UTC.
--
-- `amount` KEEPS ITS MEANING EXACTLY: what the organization received.
-- `get_finance_report_data` (20260916010000) selects `amount` bucketed by
-- `received_date`, and that is untouched here -- Income stays the money that
-- landed. `gross_amount`/`fee_amount` are context carried beside the row, the
-- way the sales register keeps collected tax beside a sale rather than inside
-- Income (docs/spec/finance.md 5.22). Where both are present the check
-- constraint holds them to `amount = gross_amount - fee_amount`, so the three
-- columns can never disagree.
--
-- `received_date` STAYS THE REPORTING ANCHOR. An imported instant is converted
-- to the organization's own day using `app_settings.org.timezone` (#1065), so
-- a gift made at 7pm on the last day of the month belongs in that month. There
-- is deliberately no second date column to report from: two of them is two
-- answers to "what did February bring in".
--
-- DONOR IDENTITY STAYS MANUAL. A processor export carries a name and an email,
-- not a `people` row. Auto-creating people from an import would put donor
-- contact details into the directory in bulk, with no dedupe (20260824170000
-- exists because that is hard even one row at a time) and a retention posture
-- nobody chose. So the import never creates a person: `donor_id` stays null,
-- and linking a donor is the existing PersonPicker on the edit modal, one gift
-- at a time, when somebody actually wants it.

-- ---------------------------------------------------------------------------
-- 1. Provenance columns
-- ---------------------------------------------------------------------------

alter table public.monetary_donations
  -- 'processor' is unused until a real integration exists (see the closing
  -- note). It is in the constraint now so that adding one is not another
  -- migration against a table carrying audit coverage and a sync trigger.
  add column source text not null default 'manual'
    check (source in ('manual', 'import', 'processor')),
  -- The provider's own transaction id. The partial unique index below is what
  -- makes a re-run idempotent; nullable because a typed gift has no such id.
  add column external_reference text,
  -- The tenant's own words for where it came from -- the same free text as
  -- `giving.provider_label` (#1389), and deliberately not an enum, for the
  -- reason that migration gives: a list of processors the platform blesses is
  -- a recommendation it is in no position to make.
  add column processor_label text,
  add column gross_amount numeric(10, 2) check (gross_amount >= 0),
  add column fee_amount numeric(10, 2) check (fee_amount >= 0),
  add constraint monetary_donations_amount_is_net_of_fee check (
    gross_amount is null
    or fee_amount is null
    or amount = gross_amount - fee_amount
  );

comment on column public.monetary_donations.source is
  'How the row got here (#1390): manual (somebody typed it), import (a processor CSV), processor (a live integration -- reserved, nothing writes it yet).';
comment on column public.monetary_donations.external_reference is
  'The provider''s own transaction id, unique per tenant where present (#1390). What makes re-importing an overlapping export a no-op rather than a duplicate.';
comment on column public.monetary_donations.gross_amount is
  'What the donor gave, before the processor''s cut (#1390). Context beside the row; `amount` is still what the organization received and still what Income reports.';
comment on column public.monetary_donations.fee_amount is
  'What the processor kept (#1390). Null where the platform passes its cost to the donor, which is how Zeffy and a tipped Givebutter gift arrive.';

-- Per tenant, and only where there is a reference: two tenants importing from
-- the same platform will collide on ids otherwise, and every hand-entered row
-- has a null here and must not collide with any other.
create unique index monetary_donations_tenant_external_reference_key
  on public.monetary_donations (tenant_id, external_reference)
  where external_reference is not null;

-- ---------------------------------------------------------------------------
-- 2. An imported row's figures are not the portal's to edit
-- ---------------------------------------------------------------------------

-- The forms render these fields read-only for an imported row, but the forms
-- are not the guarantee: `monetary_donations` has a plain update policy, so a
-- raw PostgREST write could otherwise change an imported gift's amount and
-- leave the ledger disagreeing with the bank while still claiming the
-- provider's transaction id. A mistake in an import is a delete and a
-- re-import -- the same call docs/spec/finance.md 5.22 made for sales -- and
-- this is what makes that true rather than merely advised.
--
-- Everything a human legitimately adds afterwards stays editable: the donor
-- (the import deliberately leaves it null), the event, the notes, the date.
-- Only the figures the provider reported, and the provenance that says where
-- they came from, are frozen.
create function public.monetary_donations_freeze_imported_figures()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Checked before the manual short-circuit below: relabelling a typed gift as
  -- imported would launder it past every other rule here.
  if new.source is distinct from old.source then
    raise exception 'IMPORTED_DONATION_IS_READ_ONLY'
      using hint = 'Where a gift came from is not something to edit.';
  end if;
  if old.source = 'manual' then
    return new;
  end if;
  if new.amount is distinct from old.amount
     or new.gross_amount is distinct from old.gross_amount
     or new.fee_amount is distinct from old.fee_amount
     or new.external_reference is distinct from old.external_reference then
    raise exception 'IMPORTED_DONATION_IS_READ_ONLY'
      using hint = 'Delete the gift and import it again.';
  end if;
  return new;
end;
$$;

comment on function public.monetary_donations_freeze_imported_figures() is
  'Refuses an edit to an imported gift''s amounts, transaction id or source (#1390). The forms show them read-only; this is what makes it true of a raw write as well.';

create trigger freeze_imported_figures
  before update on public.monetary_donations
  for each row execute function public.monetary_donations_freeze_imported_figures();

-- ---------------------------------------------------------------------------
-- 3. The import
-- ---------------------------------------------------------------------------

-- Why an RPC rather than a plain insert through PostgREST, which the table's
-- policies would already allow: the skip. `on conflict do nothing` needs to
-- report how many rows it did nothing about, and a client that inserted and
-- counted the difference would be asserting the number rather than observing
-- it. The definer function also pins `received_date` to the org's own day in
-- one place, rather than trusting whatever date a browser computed.
--
-- Rows already present are SKIPPED, NOT UPDATED. Re-importing an overlapping
-- export -- which is what happens every month, because an export window
-- overlaps the last one -- must not rewrite history. A mistake in an import is
-- a delete and a re-import, the same call docs/spec/finance.md 5.22 made for
-- sales.
create function public.bulk_import_monetary_donations(
  p_rows jsonb,
  p_processor_label text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_label text := nullif(btrim(coalesce(p_processor_label, '')), '');
  v_zone text;
  v_total int;
  v_inserted int;
  v_row jsonb;
  v_amount numeric(10, 2);
  v_gross numeric(10, 2);
  v_fee numeric(10, 2);
begin
  if not public.has_permission('finance', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_tenant_id is null then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'IMPORT_ROWS_INVALID';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total = 0 then
    raise exception 'IMPORT_EMPTY';
  end if;
  -- A month of a small organization's gifts, with room to spare. The cap is
  -- here because every inserted row also writes an audit row: 500 is a page
  -- of audit history somebody can still read, and a file bigger than that is
  -- a year being loaded at once, which wants splitting anyway.
  if v_total > 500 then
    raise exception 'IMPORT_TOO_MANY_ROWS';
  end if;

  if length(coalesce(v_label, '')) > 60 then
    raise exception 'PROCESSOR_LABEL_TOO_LONG';
  end if;

  -- The organization's own day (#1065), read the way get_finance_report_data
  -- reads it and falling back the same way: a tenant that has never set a zone
  -- gets UTC, which is what every report assumed before #1065, and a
  -- hand-edited value Postgres does not recognise gets UTC rather than making
  -- `at time zone` raise mid-import.
  select coalesce(value #>> '{}', 'UTC') into v_zone
  from public.app_settings
  where tenant_id = v_tenant_id and key = 'org.timezone';

  if v_zone is null or not exists (
    select 1 from pg_timezone_names where name = v_zone
  ) then
    v_zone := 'UTC';
  end if;

  -- Validate every row before writing any of them. A half-applied import is
  -- worse than a refused one: the reader cannot tell which half.
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'IMPORT_ROW_INVALID';
    end if;
    if coalesce(btrim(v_row ->> 'external_reference'), '') = '' then
      raise exception 'IMPORT_REFERENCE_REQUIRED';
    end if;
    if length(v_row ->> 'external_reference') > 200 then
      raise exception 'IMPORT_REFERENCE_TOO_LONG';
    end if;
    -- Typed before cast, not after: `('abc')::numeric` raises a Postgres error
    -- the UI has no sentence for, where a refused row has one.
    if jsonb_typeof(v_row -> 'amount') <> 'number' then
      raise exception 'IMPORT_AMOUNT_INVALID';
    end if;
    if coalesce(jsonb_typeof(v_row -> 'gross_amount'), 'null')
         not in ('number', 'null') then
      raise exception 'IMPORT_GROSS_INVALID';
    end if;
    if coalesce(jsonb_typeof(v_row -> 'fee_amount'), 'null')
         not in ('number', 'null') then
      raise exception 'IMPORT_FEE_INVALID';
    end if;

    v_amount := (v_row ->> 'amount')::numeric;
    v_gross := (v_row ->> 'gross_amount')::numeric;
    v_fee := (v_row ->> 'fee_amount')::numeric;

    if v_amount < 0 or v_amount <> round(v_amount, 2) then
      raise exception 'IMPORT_AMOUNT_INVALID';
    end if;
    if v_gross is not null and (v_gross < 0 or v_gross <> round(v_gross, 2)) then
      raise exception 'IMPORT_GROSS_INVALID';
    end if;
    if v_fee is not null and (v_fee < 0 or v_fee <> round(v_fee, 2)) then
      raise exception 'IMPORT_FEE_INVALID';
    end if;
    if v_gross is not null and v_fee is not null and v_amount <> v_gross - v_fee then
      raise exception 'IMPORT_AMOUNT_MISMATCH';
    end if;

    if coalesce(btrim(v_row ->> 'received_at'), '') = '' then
      raise exception 'IMPORT_RECEIVED_AT_REQUIRED';
    end if;
    begin
      perform (v_row ->> 'received_at')::timestamptz;
    exception when others then
      raise exception 'IMPORT_RECEIVED_AT_INVALID';
    end;
  end loop;

  with parsed as (
    select
      btrim(row_value ->> 'external_reference') as external_reference,
      (row_value ->> 'amount')::numeric(10, 2) as amount,
      (row_value ->> 'gross_amount')::numeric(10, 2) as gross_amount,
      (row_value ->> 'fee_amount')::numeric(10, 2) as fee_amount,
      -- The instant, read as a day in the organization's zone. `at time zone`
      -- on a timestamptz returns the wall clock there, which is exactly the
      -- day the organization would say the gift arrived.
      (((row_value ->> 'received_at')::timestamptz at time zone v_zone)::date)
        as received_date,
      nullif(btrim(coalesce(row_value ->> 'notes', '')), '') as notes
    from jsonb_array_elements(p_rows) as row_value
  ),
  written as (
    insert into public.monetary_donations (
      tenant_id, donor_id, event_id, amount, method, received_date, notes,
      source, external_reference, processor_label, gross_amount, fee_amount
    )
    select
      v_tenant_id,
      -- Never a person. See the header: an import that populated the
      -- directory in bulk would be a retention decision nobody made.
      null,
      null,
      parsed.amount,
      -- Every processor gift was paid online, whatever the donor's card was.
      -- `method` is not null on this table and the import has nothing truer to
      -- put there; the provider's own name rides in `processor_label`.
      'online',
      parsed.received_date,
      parsed.notes,
      'import',
      parsed.external_reference,
      v_label,
      parsed.gross_amount,
      parsed.fee_amount
    from parsed
    -- Matches the partial unique index above, which is what lets a repeated
    -- export land as a no-op. Duplicates *within* one file are skipped by the
    -- same clause rather than raising, which `do update` could not do.
    on conflict (tenant_id, external_reference) where external_reference is not null
      do nothing
    returning 1
  )
  select count(*) into v_inserted from written;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_total - v_inserted
  );
end;
$$;

comment on function public.bulk_import_monetary_donations(jsonb, text) is
  'Imports a processor''s CSV export into monetary_donations (#1390). Gated on finance:manage. Upserts on (tenant_id, external_reference) as skip-not-update, so re-importing an overlapping export is a no-op, and buckets each instant onto the organization''s own day via app_settings.org.timezone. Never creates a person.';

revoke execute on function public.bulk_import_monetary_donations(jsonb, text) from public, anon;
grant execute on function public.bulk_import_monetary_donations(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The remembered column mapping
-- ---------------------------------------------------------------------------

-- Each provider names its columns differently, and a tenant re-imports from
-- the same one every month. `giving.import_mapping` holds the header names it
-- last mapped, so next month's file is one paste rather than six pickers.
--
-- It sits beside #1389's other `giving.*` keys and is deliberately NOT in
-- `public_giving_settings`: that view enumerates its seven keys rather than
-- matching a `giving.%` prefix, precisely so an eighth key stays private until
-- a migration says otherwise (#888). Nothing public has any use for a tenant's
-- spreadsheet headers.
--
-- Its own pair of RPCs rather than two more parameters on
-- get/set_giving_settings(): the giving settings are what the public site
-- renders, this is a convenience for one portal page, and widening a function
-- that writes a published URL to also carry this would put them on one
-- permission check and one audit story when they have nothing else in common.

create function public.get_donation_import_mapping()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.has_permission('finance', 'view') then coalesce(
      (select s.value from public.app_settings s
        where s.tenant_id = (select public.current_tenant_id())
          and s.key = 'giving.import_mapping'
          and jsonb_typeof(s.value) = 'object'),
      '{}'::jsonb)
    else null
  end;
$$;

comment on function public.get_donation_import_mapping() is
  'The header names this tenant last mapped onto the donation import''s fields (#1390), or null without finance:view.';

revoke execute on function public.get_donation_import_mapping() from public, anon;
grant execute on function public.get_donation_import_mapping() to authenticated;

create function public.set_donation_import_mapping(p_mapping jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_field text;
  v_fields text[] := array[
    'external_reference', 'amount', 'gross_amount', 'fee_amount',
    'received_at', 'notes'
  ];
begin
  if not public.has_permission('finance', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_tenant_id is null then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_mapping is null or jsonb_typeof(p_mapping) <> 'object' then
    raise exception 'IMPORT_MAPPING_INVALID';
  end if;

  -- Only the six fields the import knows, only strings, only a header long
  -- enough to be one. A key nobody reads is a key somebody will later read by
  -- accident.
  for v_field in select jsonb_object_keys(p_mapping)
  loop
    if not (v_field = any (v_fields)) then
      raise exception 'IMPORT_MAPPING_INVALID';
    end if;
    if jsonb_typeof(p_mapping -> v_field) <> 'string' then
      raise exception 'IMPORT_MAPPING_INVALID';
    end if;
    if length(p_mapping ->> v_field) > 200 then
      raise exception 'IMPORT_MAPPING_INVALID';
    end if;
  end loop;

  insert into public.app_settings (tenant_id, key, value, updated_by)
  values (v_tenant_id, 'giving.import_mapping', p_mapping, auth.uid())
  on conflict (tenant_id, key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

comment on function public.set_donation_import_mapping(jsonb) is
  'Remembers which of the tenant''s CSV headers map onto the donation import''s six fields (#1390). Gated on finance:manage, like set_giving_settings(); deliberately outside public_giving_settings, which enumerates its keys.';

revoke execute on function public.set_donation_import_mapping(jsonb) from public, anon;
grant execute on function public.set_donation_import_mapping(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- What is deliberately not here
-- ---------------------------------------------------------------------------
--
-- A LIVE INTEGRATION. A `payment_connections` table, per-tenant secrets in
-- Supabase Vault, a webhook route resolving the tenant from the payload rather
-- than the host (Stripe posts every connected account's events to one URL and
-- names the account in `event.account`), and per-event idempotency. Worth its
-- own issue once a tenant asks; `source = 'processor'` and the unique
-- reference above are the hooks it will use.
--
-- REFUNDS AND CHARGEBACKS. A refunded gift is a delete or a hand-entered
-- negative correction until there is an integration to hear about one.
--
-- RECURRING-GIFT SCHEDULES, DONOR RECEIPTS, and anything resembling donor
-- management. The processor owns all three, and a second receipt issued by
-- this platform would be a compliance liability rather than a feature.
