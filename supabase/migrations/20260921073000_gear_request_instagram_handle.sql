-- #1357: the public gear request asks for an Instagram handle.
--
-- Every other public intake form already does. Event registration has asked
-- since #1165, the claim form since #1162, and `/my/details` lets a person
-- correct it -- because for this tenant the handle is frequently the only
-- identifier that actually reaches somebody, and it is a match key the claim
-- matcher already trusts (`normalize_instagram_handle`, 20260916060000).
--
-- Nothing new is stored: `people.instagram_handle` is the column, and
-- `resolve_or_create_person_by_email()` has taken `p_instagram_handle` since
-- 20260830080000 -- `request_gear_items()` simply passed it `null`. So this
-- migration only widens the RPC by one argument and hands the handle on. The
-- retention purge and the audit redaction already clear that column, so the
-- handle inherits the gear clock with no further work.
--
-- What it does *not* do is overwrite. The rule is the one
-- `resolve_or_create_person_by_email()` already applies to pronouns: fill the
-- column when the matched person's is null, never replace what is there. A
-- returning requester typing a handle they have since changed must not undo a
-- correction a staffer made in the directory.
--
-- Body otherwise unchanged from 20260913230000.

drop function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text);

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
  p_instagram_handle text default null
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
  v_instagram_handle text := public.normalize_instagram_handle(p_instagram_handle);
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

comment on function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text, text) is
  'The public gear library cart (#247, #1032, #1357): reserves every item all-or-nothing and records one gear_requests header carrying the delivery method, the shipping address and the postage payment preference. The requester''s Instagram handle lands on their people row, filling an empty column and never replacing one. Returns the request id; a filled honeypot returns a fresh uuid with no row behind it.';

grant execute on function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text, text) to anon, authenticated;
