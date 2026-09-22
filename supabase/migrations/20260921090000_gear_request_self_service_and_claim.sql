-- #1359: the gear cart gets the two halves of the events precedent it was
-- still missing -- a self-service write, and a claim minted from the request.
--
-- Three things happen here, and they are one migration because they are one
-- change to how a gear request finds its person.
--
--   1. `create_gear_request()`, an internal function holding everything about
--      a request that is a property of the *request* rather than of who is
--      asking: the settings validation, the item locks, the header row, the
--      movements. Both public entry points call it, so the two cannot drift.
--   2. `request_gear_items_as_me()`, the twin of `register_myself_for_event()`
--      (20260916090000). It reads the person from the session instead of
--      resolving an email, which is the only thing that actually closes the
--      duplicate-person path: prefill (#1357) makes a linked requester land on
--      the right row in practice, but only because the address it prefills is
--      the one on the record -- edit it and the request goes somewhere else.
--   3. `submit_claim_from_gear_request()`, the twin of
--      `submit_claim_from_registration()` (20260919020000), so the offer after
--      an anonymous request has a claim to mint.
--
-- It also restores a guard that went missing. 20260921073000 rebuilt
-- `request_gear_items()` from the 20260913230000 body, which predates #1206,
-- and the `NAME_REQUIRED` floor 20260916160000 had added was lost with it. A
-- blank name from a direct `anon` call has been raising a bare 23514 from the
-- `people` check constraint since. It comes back below.

-- ---------------------------------------------------------------------------
-- 1. The request itself, once
-- ---------------------------------------------------------------------------
--
-- Everything from "which items, and may they be held" through to the rows
-- that hold them. Not granted to anybody: it takes a `people.id` and a tenant
-- as arguments and checks neither, because its two callers have each just
-- established both in the way that is right for them -- one by resolving an
-- email, the other by reading the session. Reachable from outside, that would
-- be a function for reserving gear in anyone's name.
--
-- The delivery rules are the tenant's settings rather than platform code
-- (#1032), the lock order is `order by 1` so overlapping carts queue instead
-- of deadlocking, and the whole thing is one transaction, which is what makes
-- a cart all-or-nothing.
create function public.create_gear_request(
  p_tenant_id uuid,
  p_person_id uuid,
  p_inventory_item_ids uuid[],
  p_notes text default null,
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
  v_request_id uuid;
  v_notes text := nullif(btrim(p_notes), '');
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
     ship_region, ship_postal_code, ship_country, payment_method, notes)
  values
    (p_tenant_id, p_person_id, v_delivery, v_ship_name, v_ship_line1, v_ship_line2, v_ship_city,
     v_ship_region, v_ship_postal_code, v_ship_country, v_payment_method, v_notes)
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

comment on function public.create_gear_request(uuid, uuid, uuid[], text, text, jsonb, text) is
  'Everything a gear request is once its requester is known (#1359): validates the delivery choice against the tenant''s gear_requests.* settings, locks and reserves every item all-or-nothing, and writes the gear_requests header plus one inventory_movements row per item. Internal -- it trusts the tenant and person it is handed, so only request_gear_items() and request_gear_items_as_me() may call it.';

revoke execute on function public.create_gear_request(uuid, uuid, uuid[], text, text, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The anonymous path, now only the part that is about the requester
-- ---------------------------------------------------------------------------
--
-- Same signature, so `create or replace` and the existing grant stand. What is
-- left here is exactly what differs from the self-service twin: the abuse
-- controls a form on the open web needs, and working out which person an email
-- belongs to -- which is where duplicate `people` rows come from, and why the
-- two are two functions rather than one with an extra argument (§5.9).
create or replace function public.request_gear_items(
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
  p_instagram_handle text default null
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
  -- caller gets a message it can act on rather than a 23514. Dropped by
  -- accident in 20260921073000, restored here.
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
    p_delivery_method, p_shipping, p_payment_method
  );
end;
$$;

comment on function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text, text) is
  'The public gear library cart for a visitor with no account (#247, #1032, #1357): matches or mints a people row from the typed email, then reserves every item all-or-nothing through create_gear_request(). The requester''s Instagram handle lands on their people row, filling an empty column and never replacing one. Returns the request id; a filled honeypot returns a fresh uuid with no row behind it.';

-- ---------------------------------------------------------------------------
-- 3. The same request, made by somebody the application already knows
-- ---------------------------------------------------------------------------
--
-- `register_myself_for_event()`'s argument, applied here: the anonymous
-- function is told a name and an address and has to work out which person
-- that is; this one is never told. Everything else is a property of the items
-- and the tenant's settings rather than of who is asking, so it is the same
-- `create_gear_request()` underneath.
--
-- No name, email, phone or handle arguments at all. There is nowhere for a
-- per-request correction to go -- `gear_requests` holds no contact columns,
-- and `set_my_contact_details()` is the only thing that edits a person -- so
-- taking them would mean accepting input the function then discards. The cart
-- shows a linked reader their own name and address rather than asking for
-- them, and points at /my/details to change either.
--
-- No honeypot either: this path costs an account and a staff-approved claim,
-- and a hidden input only catches somebody who has already been let in.
create function public.request_gear_items_as_me(
  p_inventory_item_ids uuid[],
  p_notes text default null,
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
    p_delivery_method, p_shipping, p_payment_method
  );
end;
$$;

comment on function public.request_gear_items_as_me(uuid[], text, inet, text, jsonb, text) is
  'The public gear library cart for the signed-in caller, under their own people row (#1359). Never matches or creates a person: the record is auth.uid() on the request host, so this path cannot produce a duplicate however the reader has edited their contact details. Returns the request id.';

revoke execute on function public.request_gear_items_as_me(uuid[], text, inet, text, jsonb, text) from public, anon;
grant execute on function public.request_gear_items_as_me(uuid[], text, inet, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Claiming a record from the gear request that just created it
-- ---------------------------------------------------------------------------
--
-- `submit_claim_from_registration()` (20260919020000) with a gear request as
-- the evidence, and everything that makes the claimant's half of #1162 safe
-- kept, because it is the same half: it returns nothing in every branch, it is
-- rate-limited as the one thing it will say out loud, it carries the module
-- gate in the database rather than only on the page, it never writes
-- `people.auth_user_id`, and `claimed_person_id` stays null.
--
-- The one real difference. `event_registrations` stores what somebody typed --
-- name, email, phone, handle -- so a claim from one copies it as typed. A
-- gear request stores none of that: #1032 deliberately kept the header to
-- facts about the submission, and the requester is a foreign key. So the
-- evidence here is read off the `people` row the request attached to.
--
-- That is a smaller difference than it looks. The row was matched *on the
-- typed address*, so `stated_email` is the address that was typed either way,
-- and for a requester the directory had never seen the whole row is what they
-- typed. Where it differs is a returning requester whose name or phone a
-- staffer has since corrected, and there the reviewer sees the better version
-- of a record they can already read. What it is never allowed to become is a
-- claim that *names* the record: `claimed_person_id` stays null here too, so
-- the link is still a person's decision on `person_claim_candidates()`'
-- ranking, whose tier-1 evidence is the account's verified address and not
-- anything copied below.
create function public.submit_claim_from_gear_request(
  p_request_id uuid,
  p_ip_address inet default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
  v_user_id uuid := auth.uid();
  v_requester record;
begin
  -- Before anything else, as in submit_person_claim(): a caller posting these
  -- as fast as they can is worth capping even where every branch is silent.
  if not public.check_rate_limit('submit_claim_from_gear_request', p_ip_address, 5, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if v_user_id is null or v_tenant_id is null then
    return;
  end if;

  if not public.public_module_enabled('constituent_accounts') then
    return;
  end if;

  -- Already linked: there is nothing to claim. Silent, like every other
  -- branch -- though in practice the caller is not offered this at all, since
  -- a linked reader requests down `request_gear_items_as_me()`.
  if exists (
    select 1 from public.people p
     where p.auth_user_id = v_user_id and p.tenant_id = v_tenant_id
  ) then
    return;
  end if;

  -- The request id is the evidence, and it is scoped two ways: to this host's
  -- tenant, and to a week -- long enough that sign-up with email confirmation
  -- can be finished tomorrow on another device, short enough that a leaked id
  -- cannot be replayed at leisure. A request the retention purge has already
  -- anonymized has no `person_id` and so joins to nothing, which is the same
  -- silence as an id that names nothing.
  select coalesce(nullif(btrim(p.preferred_name), ''), p.name) as name,
         p.email, p.phone, p.instagram_handle
    into v_requester
    from public.gear_requests r
    join public.people p
      on p.id = r.person_id and p.tenant_id = r.tenant_id
   where r.id = p_request_id
     and r.tenant_id = v_tenant_id
     and r.created_at > now() - interval '7 days';

  -- `stated_name` must be non-blank, and an anonymous directory record holds
  -- no name at all. A constraint violation here would be the one loud branch
  -- in a function whose whole design is silence, so it is checked.
  if not found or btrim(coalesce(v_requester.name, '')) = '' then
    return;
  end if;

  insert into public.person_claims (
    tenant_id, auth_user_id, stated_name, stated_email, stated_phone,
    stated_instagram_handle, note
  )
  values (
    v_tenant_id,
    v_user_id,
    btrim(v_requester.name),
    nullif(btrim(coalesce(v_requester.email, '')), ''),
    nullif(btrim(coalesce(v_requester.phone, '')), ''),
    public.normalize_instagram_handle(v_requester.instagram_handle),
    'Requested gear from the gear library.'
  )
  -- One pending claim per account per tenant. A second request by somebody
  -- who already has one open gets the same silence, not an error.
  on conflict (tenant_id, auth_user_id) where status = 'pending'
  do nothing;
end;
$$;

comment on function public.submit_claim_from_gear_request(uuid, inet) is
  'Opens a claim from a recent public gear request for the signed-in account in the host''s tenant (#1359). The evidence is the people row the request attached to, since gear_requests stores no typed contact fields of its own. Returns nothing in every case, for the same reason submit_person_claim() does.';

revoke execute on function public.submit_claim_from_gear_request(uuid, inet) from public, anon;
grant execute on function public.submit_claim_from_gear_request(uuid, inet) to authenticated;
