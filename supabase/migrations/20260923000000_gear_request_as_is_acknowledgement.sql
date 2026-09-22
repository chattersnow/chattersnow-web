-- Gear is given as-is: the acknowledgement recorded on the request (#1367)
-- ---------------------------------------------------------------------------
--
-- The gear library gives donated equipment away permanently.
-- `inventory_movements` has `received` and `distributed` and no `returned`, so
-- there is no return date, no deposit and no damage liability to capture. The
-- exposure is the inverse of a loan's: **handing somebody a pair of skis reads
-- as vouching for them**, and nothing in the product said it does not.
--
-- WHERE IT IS TAKEN, and why not at pickup. The original wording said the
-- acknowledgement is captured when the gear is handed over. Two things make
-- that the wrong place. Half the recipients never have a pickup --
-- `gear_requests.delivery_method` has a shipping path with an address, a quote
-- and a payment method, and a posted item has no moment where somebody is
-- standing in front of an organizer. And the recipient is not in the portal:
-- `inventory_movements.created_by` is a portal user and `recipient_person_id`
-- is a directory row, so a checkbox there is staff attesting that they said
-- something. That is a note, not an acknowledgement.
--
-- The one surface where the recipient is present and acting is the public gear
-- request. So it is taken there, unconditionally, on both paths, and the
-- portal's job is to show that it was taken.
--
-- A SNAPSHOT, NOT A POINTER, which is #1319's call and the opposite of #686's.
-- The words are a constant in `src/lib/gear-as-is.ts` -- no version table, no
-- permalink, no identity -- so the only place they are citable from is the row
-- that accepted them. A waiver has both since #601 and therefore gets a
-- version pointer; this has neither and therefore gets the text.
--
-- The text is supplied by the *server* and never by the browser. Both public
-- entry points build it from that constant against the tenant's lexicon, the
-- same way `submit_artwork()` reads the call's `rights_note` off the call row
-- rather than from its caller. A snapshot the client sent would record what
-- the client said it showed, which is a different fact.

alter table public.gear_requests
  add column as_is_acknowledged_at timestamptz,
  add column as_is_text text;

comment on column public.gear_requests.as_is_acknowledged_at is
  'When the requester ticked the box saying they understand these items are given as-is (#1367). Set by create_gear_request() on every path; null only on rows written before this shipped.';

comment on column public.gear_requests.as_is_text is
  'The summary the requester was actually shown, snapshotted (#1367). Built server-side from GEAR_AS_IS_SUMMARY in src/lib/gear-as-is.ts against this tenant''s lexicon, never sent by the client. A constant in a component has no version table and no permalink, so this row is the only place the wording is citable from -- the same call as artwork_submissions.consented_terms, and the opposite of event_registrations.waiver_version.';

-- Not added to `audited_tables.redacted_columns` for this table, which holds
-- the address columns and `notes`. Those are the requester's own prose and
-- their postal address; this is the organization's own published wording and
-- the fact that somebody read it. A redacted acknowledgement is not a record.
--
-- Nor does the retention purge touch either column. Rule E2 in
-- `purge_expired_records()` names the columns it clears -- `person_id`, the
-- seven `ship_*` fields, `payment_method` and `notes` -- so both of these
-- survive the anonymization beside the delivery facts without a change here.
-- That is deliberate and not an oversight: an acknowledgement is a fact about
-- an act and about the organization's own published words, not personal data
-- about the requester. Same call as #686's and #1319's.
--
-- No backfill. Every row written before this migration was taken without the
-- acknowledgement being asked for, and a value invented for those rows would
-- assert that somebody read something they were never shown. Null is the
-- honest answer and the portal says "Not recorded" for it.

-- ---------------------------------------------------------------------------
-- What every path records, resolved once
-- ---------------------------------------------------------------------------
--
-- `accepted_waiver_version()` exists because the two registration RPCs could
-- otherwise disagree about whether a waiver is required, and the failure would
-- be silent in the direction that matters -- a constituent account becoming
-- the way to register without accepting anything. The same hazard applies
-- here, and gear already has a stronger answer available: #1359 put everything
-- that is a property of the *request* rather than of who is asking into one
-- internal `create_gear_request()`, which both entry points call. So this is
-- resolved there, once, rather than by two callers of a shared function.
-- The signed-in path cannot become the way to get gear without acknowledging
-- anything, because there is no second place for it to be decided.
--
-- Unconditional, unlike the waiver. A waiver is a tenant's own text and exists
-- only where that tenant has published one; this is the platform's own words
-- about what the software and the organization running it do not do, so it is
-- true of every tenant with a gear library and is asked on every request.

create function public.acknowledged_as_is(
  p_acknowledged boolean,
  p_text text
) returns text
language plpgsql
set search_path = public
as $$
declare
  -- Stored verbatim apart from this: the organization's published wording,
  -- where trimming or emptying it would edit the thing the record exists to
  -- preserve. Whitespace-only is the same fact as nothing.
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if p_acknowledged is not true then
    raise exception 'AS_IS_REQUIRED';
  end if;

  -- Never the caller's fault, and never reachable from this application: both
  -- public entry points build the text themselves. It is checked because the
  -- alternative is an acknowledgement pointing at nothing, which is exactly
  -- the state the snapshot exists to prevent -- the row would read "understood
  -- something, at 14:02". A direct `anon` call that ticks the box and sends no
  -- words gets this rather than a record of an agreement to nothing.
  if v_text is null then
    raise exception 'AS_IS_TEXT_REQUIRED';
  end if;

  return v_text;
end;
$$;

comment on function public.acknowledged_as_is(boolean, text) is
  'Resolves what a gear request records about the as-is acknowledgement (#1367), and refuses the request where it must. Returns the snapshot to store, and raises AS_IS_REQUIRED when the box was not ticked or AS_IS_TEXT_REQUIRED when no wording was supplied. Called from create_gear_request(), so every path through the public cart answers to it once.';

revoke execute on function public.acknowledged_as_is(boolean, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The request itself
-- ---------------------------------------------------------------------------
--
-- Two trailing parameters change the signature, so this drops before
-- recreating, and its two callers drop first because they depend on it. The
-- body is otherwise unchanged from 20260921090000.

drop function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text, text);
drop function public.request_gear_items_as_me(uuid[], text, inet, text, jsonb, text);
drop function public.create_gear_request(uuid, uuid, uuid[], text, text, jsonb, text);

create function public.create_gear_request(
  p_tenant_id uuid,
  p_person_id uuid,
  p_inventory_item_ids uuid[],
  p_notes text default null,
  p_delivery_method text default 'meetup',
  p_shipping jsonb default null,
  p_payment_method text default null,
  p_as_is_acknowledged boolean default false,
  p_as_is_text text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_status text;
  v_request_id uuid;
  v_notes text := nullif(btrim(p_notes), '');
  v_delivery text := coalesce(nullif(btrim(p_delivery_method), ''), 'meetup');
  v_shipping_enabled boolean;
  v_payment_method text := nullif(btrim(coalesce(p_payment_method, '')), '');
  v_as_is_text text;
  v_ship_name text;
  v_ship_line1 text;
  v_ship_line2 text;
  v_ship_city text;
  v_ship_region text;
  v_ship_postal_code text;
  v_ship_country text;
begin
  if p_inventory_item_ids is null or array_length(p_inventory_item_ids, 1) is null then
    raise exception 'NO_ITEMS';
  end if;

  -- Before the delivery rules and well before the item locks: refusing a cart
  -- after taking row locks on everything in it is work done for a request that
  -- was never going to be written, and "you did not tick the box" is the first
  -- thing to say when it is true.
  v_as_is_text := public.acknowledged_as_is(p_as_is_acknowledged, p_as_is_text);

  if v_delivery not in ('shipping', 'meetup') then
    raise exception 'DELIVERY_METHOD_INVALID';
  end if;

  if v_delivery = 'shipping' then
    -- The form only offers shipping when the tenant has turned it on, so
    -- reaching here without it is a stale tab or a hand-crafted call.
    select (s.value = 'true'::jsonb) into v_shipping_enabled
      from public.app_settings s
     where s.tenant_id = p_tenant_id
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
       where s.tenant_id = p_tenant_id
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
      and tenant_id = p_tenant_id
      and intended_use = 'gear_library'
    for update;

    if not found then
      raise exception 'ITEM_NOT_FOUND';
    end if;

    if v_status <> 'available' then
      raise exception 'ITEM_ALREADY_REQUESTED';
    end if;
  end loop;

  insert into public.gear_requests
    (tenant_id, person_id, delivery_method, ship_name, ship_line1, ship_line2, ship_city,
     ship_region, ship_postal_code, ship_country, payment_method, notes,
     as_is_acknowledged_at, as_is_text)
  values
    (p_tenant_id, p_person_id, v_delivery, v_ship_name, v_ship_line1, v_ship_line2, v_ship_city,
     v_ship_region, v_ship_postal_code, v_ship_country, v_payment_method, v_notes,
     now(), v_as_is_text)
  returning id into v_request_id;

  foreach v_item_id in array p_inventory_item_ids
  loop
    -- notes stay on the header; the movement is the hold and nothing more.
    insert into public.inventory_movements
      (tenant_id, inventory_item_id, movement_type, quantity, reason, recipient_person_id, gear_request_id)
    values
      (p_tenant_id, v_item_id, 'reserved', 1, 'Public gear library request', p_person_id, v_request_id);

    update public.inventory_items set status = 'reserved'
     where id = v_item_id and tenant_id = p_tenant_id;
  end loop;

  return v_request_id;
end;
$$;

comment on function public.create_gear_request(uuid, uuid, uuid[], text, text, jsonb, text, boolean, text) is
  'Everything a gear request is once its requester is known (#1359): resolves the as-is acknowledgement (#1367), validates the delivery choice against the tenant''s gear_requests.* settings, locks and reserves every item all-or-nothing, and writes the gear_requests header plus one inventory_movements row per item. Internal -- it trusts the tenant and person it is handed, so only request_gear_items() and request_gear_items_as_me() may call it.';

revoke execute on function public.create_gear_request(uuid, uuid, uuid[], text, text, jsonb, text, boolean, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The anonymous path
-- ---------------------------------------------------------------------------
--
-- Unchanged from 20260921090000 apart from the two parameters it passes
-- through. It does not read them: what was shown and whether it was ticked are
-- properties of the request, not of how the requester was identified.

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
  p_payment_method text default null,
  p_instagram_handle text default null,
  p_as_is_acknowledged boolean default false,
  p_as_is_text text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_tenant_id uuid := public.public_tenant_id();
  v_instagram_handle text := public.normalize_instagram_handle(p_instagram_handle);
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

  -- create_gear_request() checks this too, and authoritatively. It is here as
  -- well only to keep the order a caller sees: an empty cart has said
  -- NO_ITEMS since #247, and it should not start saying NAME_REQUIRED because
  -- the name check moved in front of a function call.
  if p_inventory_item_ids is null or array_length(p_inventory_item_ids, 1) is null then
    raise exception 'NO_ITEMS';
  end if;

  -- #1206: the same floor submit_volunteer_application() has always had. The
  -- people check constraint refuses the row either way; this is so a public
  -- caller gets a message it can act on rather than a 23514.
  if p_name is null or btrim(p_name) = '' then
    raise exception 'NAME_REQUIRED';
  end if;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', null, v_instagram_handle, null, v_tenant_id
  );

  -- A person the directory already knew keeps the handle it already holds:
  -- resolve_or_create_person_by_email() writes one only on the row it creates.
  if v_instagram_handle is not null then
    update public.people
       set instagram_handle = v_instagram_handle
     where id = v_person_id
       and tenant_id = v_tenant_id
       and instagram_handle is null;
  end if;

  return public.create_gear_request(
    v_tenant_id, v_person_id, p_inventory_item_ids, p_notes,
    p_delivery_method, p_shipping, p_payment_method,
    p_as_is_acknowledged, p_as_is_text
  );
end;
$$;

comment on function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text, text, boolean, text) is
  'The public gear library cart for a visitor with no account (#247, #1032, #1357): matches or mints a people row from the typed email, then reserves every item all-or-nothing through create_gear_request(), which records the as-is acknowledgement (#1367). The requester''s Instagram handle lands on their people row, filling an empty column and never replacing one. Returns the request id; a filled honeypot returns a fresh uuid with no row behind it.';

grant execute on function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text, text, boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The self-service path
-- ---------------------------------------------------------------------------
--
-- Takes the same two parameters, for the reason #686 gives for asking a
-- signed-in registrant to accept the waiver again: holding an account is not
-- agreement to anything, and an account must not become the way to get gear
-- without being told what taking it means.

create function public.request_gear_items_as_me(
  p_inventory_item_ids uuid[],
  p_notes text default null,
  p_ip_address inet default null,
  p_delivery_method text default 'meetup',
  p_shipping jsonb default null,
  p_payment_method text default null,
  p_as_is_acknowledged boolean default false,
  p_as_is_text text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_person_id uuid;
begin
  -- Same route budget as the anonymous form. A signed-in caller is not more
  -- trustworthy for this purpose: an account costs an email address, and the
  -- write it reaches is the same table.
  if not public.check_rate_limit('request_gear_items_as_me', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  -- One call, two gates: the session's own `people` row, and the tenant
  -- having both the constituent area and inventory turned on (#902).
  v_person_id := public.my_constituent_person_id('inventory');
  if v_person_id is null then
    raise exception 'NO_RECORD';
  end if;

  return public.create_gear_request(
    v_tenant_id, v_person_id, p_inventory_item_ids, p_notes,
    p_delivery_method, p_shipping, p_payment_method,
    p_as_is_acknowledged, p_as_is_text
  );
end;
$$;

comment on function public.request_gear_items_as_me(uuid[], text, inet, text, jsonb, text, boolean, text) is
  'The public gear library cart for the signed-in caller, under their own people row (#1359). Never matches or creates a person: the record is auth.uid() on the request host, so this path cannot produce a duplicate however the reader has edited their contact details. Asks for the as-is acknowledgement exactly as the anonymous path does (#1367). Returns the request id.';

revoke execute on function public.request_gear_items_as_me(uuid[], text, inet, text, jsonb, text, boolean, text) from public, anon;
grant execute on function public.request_gear_items_as_me(uuid[], text, inet, text, jsonb, text, boolean, text) to authenticated;
