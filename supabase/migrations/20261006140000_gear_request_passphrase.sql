-- Gear library: an optional tenant passphrase before a visitor can request (#1536)
-- ---------------------------------------------------------------------------
--
-- Some organizations hand gear only to the people they already serve, and
-- tell those people a shared word -- a door code, not a credential. The
-- catalog stays open to browse; adding to the cart asks for the word, and the
-- request is refused without it.
--
-- OFF FOR EVERY TENANT. Nothing is seeded: an absent
-- `gear_requests.passphrase_required` row reads as false everywhere below,
-- which is every tenant today, Chatter Snow included.
--
-- STORED READABLE, on purpose. Staff give the word out over the phone and
-- need to read it back, so it is an ordinary `app_settings` string that
-- get_gear_request_settings() returns to inventory:manage. It is never hashed
-- and never selected by `public_gear_request_settings`: anon learns that a
-- gate exists and how to ask for the word, never the word.
--
-- ENFORCED IN THE DATABASE, ONCE. The dialog on the site is only the UX --
-- anon can call request_gear_items() directly, and the public API is a third
-- caller. #1359 put everything that is a property of the request into
-- create_gear_request(), which both RPCs call, so the check lives there and
-- there is no second place for the signed-in path to skip it. No bypass for
-- tenant members either (2026-10-06): staff use the portal checkout (#1519).
--
-- Compared trimmed and case-insensitively, so a word read out over the phone
-- still works. Rotating it invalidates every browser that unlocked with the
-- old one, because the client resends what it verified and nothing is cached
-- on this side.

-- ---------------------------------------------------------------------------
-- 1. The comparison
-- ---------------------------------------------------------------------------

create function public.gear_request_passphrase_ok(
  p_tenant_id uuid,
  p_passphrase text
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when not coalesce(
      (select s.value = 'true'::jsonb
         from public.app_settings s
        where s.tenant_id = p_tenant_id
          and s.key = 'gear_requests.passphrase_required'),
      false
    ) then true
    else coalesce(
      (select nullif(btrim(s.value #>> '{}'), '') is not null
              and lower(btrim(s.value #>> '{}')) = lower(btrim(coalesce(p_passphrase, '')))
         from public.app_settings s
        where s.tenant_id = p_tenant_id
          and s.key = 'gear_requests.passphrase'
          and jsonb_typeof(s.value) = 'string'),
      false
    )
  end;
$$;

comment on function public.gear_request_passphrase_ok(uuid, text) is
  'Whether a gear request may proceed past the tenant''s passphrase (#1536): true when the tenant does not require one, otherwise whether p_passphrase matches it trimmed and case-insensitively. A required passphrase that is blank matches nothing. Internal.';

revoke execute on function public.gear_request_passphrase_ok(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The dialog's check
-- ---------------------------------------------------------------------------
--
-- What the site's dialog calls before it unlocks the cart. Rate-limited per
-- address, because a shared word has little entropy and this is the one
-- endpoint that answers yes or no to a guess without writing anything.

create function public.check_gear_request_passphrase(
  p_passphrase text,
  p_ip_address inet default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
begin
  if not public.check_rate_limit('check_gear_request_passphrase', p_ip_address, 10, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  -- #902: a tenant without inventory has no cart to unlock.
  if not public.module_enabled_for_tenant(v_tenant_id, 'inventory') then
    return false;
  end if;

  return public.gear_request_passphrase_ok(v_tenant_id, p_passphrase);
end;
$$;

comment on function public.check_gear_request_passphrase(text, inet) is
  'Whether p_passphrase unlocks the resolved tenant''s gear cart (#1536). True when no passphrase is required. Rate-limited per IP (10 per 15 minutes) and raises RATE_LIMITED past it. Reveals nothing but yes or no.';

grant execute on function public.check_gear_request_passphrase(text, inet) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The request itself
-- ---------------------------------------------------------------------------
--
-- One trailing parameter changes all three signatures, so the callers drop
-- before the function they depend on. Bodies are otherwise unchanged from
-- 20260923000000.

drop function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text, text, boolean, text);
drop function public.request_gear_items_as_me(uuid[], text, inet, text, jsonb, text, boolean, text);
drop function public.create_gear_request(uuid, uuid, uuid[], text, text, jsonb, text, boolean, text);

create function public.create_gear_request(
  p_tenant_id uuid,
  p_person_id uuid,
  p_inventory_item_ids uuid[],
  p_notes text default null,
  p_delivery_method text default 'meetup',
  p_shipping jsonb default null,
  p_payment_method text default null,
  p_as_is_acknowledged boolean default false,
  p_as_is_text text default null,
  p_passphrase text default null
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

  -- First of the request's own rules (#1536): a visitor without the word was
  -- never going to be let in, so nothing else about the cart is worth saying.
  if not public.gear_request_passphrase_ok(p_tenant_id, p_passphrase) then
    raise exception 'PASSPHRASE_REQUIRED';
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

comment on function public.create_gear_request(uuid, uuid, uuid[], text, text, jsonb, text, boolean, text, text) is
  'Everything a gear request is once its requester is known (#1359): checks the tenant''s passphrase (#1536), resolves the as-is acknowledgement (#1367), validates the delivery choice against the tenant''s gear_requests.* settings, locks and reserves every item all-or-nothing, and writes the gear_requests header plus one inventory_movements row per item. Internal -- it trusts the tenant and person it is handed, so only request_gear_items() and request_gear_items_as_me() may call it.';

revoke execute on function public.create_gear_request(uuid, uuid, uuid[], text, text, jsonb, text, boolean, text, text) from public, anon, authenticated;

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
  p_as_is_text text default null,
  p_passphrase text default null
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

  -- #1536: before a person is matched or minted. A visitor without the word
  -- must not leave a `people` row behind for a request that was refused.
  if not public.gear_request_passphrase_ok(v_tenant_id, p_passphrase) then
    raise exception 'PASSPHRASE_REQUIRED';
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
    p_as_is_acknowledged, p_as_is_text, p_passphrase
  );
end;
$$;

comment on function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text, text, boolean, text, text) is
  'The public gear library cart for a visitor with no account (#247, #1032, #1357): matches or mints a people row from the typed email, then reserves every item all-or-nothing through create_gear_request(), which records the as-is acknowledgement (#1367). Refuses with PASSPHRASE_REQUIRED, before touching the directory, when the tenant requires a passphrase and p_passphrase does not match it (#1536). The requester''s Instagram handle lands on their people row, filling an empty column and never replacing one. Returns the request id; a filled honeypot returns a fresh uuid with no row behind it.';

grant execute on function public.request_gear_items(uuid[], text, text, text, text, text, inet, text, jsonb, text, text, boolean, text, text) to anon, authenticated;

create function public.request_gear_items_as_me(
  p_inventory_item_ids uuid[],
  p_notes text default null,
  p_ip_address inet default null,
  p_delivery_method text default 'meetup',
  p_shipping jsonb default null,
  p_payment_method text default null,
  p_as_is_acknowledged boolean default false,
  p_as_is_text text default null,
  p_passphrase text default null
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
    p_as_is_acknowledged, p_as_is_text, p_passphrase
  );
end;
$$;

comment on function public.request_gear_items_as_me(uuid[], text, inet, text, jsonb, text, boolean, text, text) is
  'The public gear library cart for the signed-in caller, under their own people row (#1359). Never matches or creates a person: the record is auth.uid() on the request host, so this path cannot produce a duplicate however the reader has edited their contact details. Asks for the as-is acknowledgement (#1367) and the tenant''s passphrase (#1536) exactly as the anonymous path does -- an account is not a bypass. Returns the request id.';

revoke execute on function public.request_gear_items_as_me(uuid[], text, inet, text, jsonb, text, boolean, text, text) from public, anon;
grant execute on function public.request_gear_items_as_me(uuid[], text, inet, text, jsonb, text, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. What the public form may know
-- ---------------------------------------------------------------------------
--
-- Two more rows: whether a passphrase is asked for, and the tenant's own words
-- on how to get one, which the dialog shows. The passphrase itself is not
-- selected, and that is the whole of this view's job.

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
       )
union all
select 'passphrase_required'::text,
       coalesce(
         (select s.value
            from public.app_settings s
           where s.tenant_id = public.public_tenant_id()
             and s.key = 'gear_requests.passphrase_required'
             and jsonb_typeof(s.value) = 'boolean'),
         'false'::jsonb
       )
union all
select 'passphrase_help_text'::text,
       coalesce(
         (select s.value
            from public.app_settings s
           where s.tenant_id = public.public_tenant_id()
             and s.key = 'gear_requests.passphrase_help_text'
             and jsonb_typeof(s.value) = 'string'),
         '""'::jsonb
       );

comment on view public.public_gear_request_settings is
  'What the public gear request form needs of the resolved tenant''s gear_requests.* settings (#1032): whether shipping is offered, the keys and labels of the payment methods it accepts, whether a passphrase is required and the tenant''s help text for getting one (#1536). Security definer by design (#887): app_settings has no anon policy. Isolation is tenant_id = public_tenant_id() in every arm; the handles, the instructions and the passphrase itself are not selected.';

-- ---------------------------------------------------------------------------
-- 5. The settings, for the portal
-- ---------------------------------------------------------------------------
--
-- The read gains the three keys. The word itself goes only to inventory:manage
-- -- the people who set it and give it out -- and reads as empty to
-- inventory:view, which can see the panel but not change it.

create or replace function public.get_gear_request_settings()
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
          '""'::jsonb),
        'passphrase_required', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'gear_requests.passphrase_required'
              and jsonb_typeof(s.value) = 'boolean'),
          'false'::jsonb),
        'passphrase', case
          when public.has_permission('inventory', 'manage') then coalesce(
            (select s.value from public.app_settings s
              where s.tenant_id = (select public.current_tenant_id())
                and s.key = 'gear_requests.passphrase'
                and jsonb_typeof(s.value) = 'string'),
            '""'::jsonb)
          else '""'::jsonb
        end,
        'passphrase_help_text', coalesce(
          (select s.value from public.app_settings s
            where s.tenant_id = (select public.current_tenant_id())
              and s.key = 'gear_requests.passphrase_help_text'
              and jsonb_typeof(s.value) = 'string'),
          '""'::jsonb)
      )
    else null
  end;
$$;

comment on function public.get_gear_request_settings() is
  'The current tenant''s gear_requests.* settings for the Requests page (#1032, #1536), or null without inventory:view. The passphrase itself is returned only to inventory:manage.';

-- Its own writer rather than three more parameters on
-- set_gear_request_settings(): the passphrase is its own card on the Requests
-- page, and saving the delivery settings must not be able to clear it.
create function public.set_gear_request_passphrase(
  p_required boolean,
  p_passphrase text,
  p_help_text text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_passphrase text := btrim(coalesce(p_passphrase, ''));
  v_help_text text := btrim(coalesce(p_help_text, ''));
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;
  if v_tenant_id is null then
    raise exception 'PERMISSION_DENIED';
  end if;

  if coalesce(p_required, false) and v_passphrase = '' then
    raise exception 'PASSPHRASE_MISSING';
  end if;
  if length(v_passphrase) > 100 then
    raise exception 'PASSPHRASE_TOO_LONG';
  end if;
  if length(v_help_text) > 500 then
    raise exception 'PASSPHRASE_HELP_TOO_LONG';
  end if;

  insert into public.app_settings (tenant_id, key, value, updated_by)
  values
    (v_tenant_id, 'gear_requests.passphrase_required', to_jsonb(coalesce(p_required, false)), auth.uid()),
    (v_tenant_id, 'gear_requests.passphrase', to_jsonb(v_passphrase), auth.uid()),
    (v_tenant_id, 'gear_requests.passphrase_help_text', to_jsonb(v_help_text), auth.uid())
  on conflict (tenant_id, key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

comment on function public.set_gear_request_passphrase(boolean, text, text) is
  'Writes the current tenant''s gear request passphrase settings (#1536): whether one is required, the passphrase (trimmed, required when on, up to 100 characters) and the help text shown with the dialog (up to 500). Gated on inventory:manage, like set_gear_request_settings().';

revoke execute on function public.set_gear_request_passphrase(boolean, text, text) from public, anon;
grant execute on function public.set_gear_request_passphrase(boolean, text, text) to authenticated;
