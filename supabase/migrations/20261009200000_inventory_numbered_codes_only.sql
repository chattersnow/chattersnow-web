-- Numbered codes only (#1541, #1543).
--
-- Intake gives an item nothing was scanned for a random asset-tag code
-- (20260923200000). A tenant that labels only with reusable numbered codes
-- (#1444) -- one NFC sticker and one QR label, both pointing at CSN-### --
-- ends up with items carrying a code nobody printed, each of which then has
-- to be found and given a numbered code by hand. This is a per-tenant setting
-- that stops issuing random codes, not a Chatter Snow special case:
--
--   * intake saves an item with nothing scanned untagged, and refuses a
--     random code scanned for it;
--   * nothing else may create one either (Generate code, blank labels, the
--     label page's Create codes), enforced in the trigger that writes a new
--     code's value;
--   * existing random codes stay: they still resolve at /portal/t/<code> and
--     can be reprinted or retired from the Codes page.
--
-- Off is today's behaviour and the default.

-- ---------------------------------------------------------------------------
-- 1. The setting
-- ---------------------------------------------------------------------------

-- On tenants beside inventory_tag_prefix, which is the other half of how a
-- tenant labels its inventory, and is set the same way.
alter table public.tenants
  add column inventory_numbered_codes_only boolean not null default false;

comment on column public.tenants.inventory_numbered_codes_only is
  'True when the tenant labels inventory with numbered codes only (#1541): intake saves an item with nothing scanned untagged instead of giving it a random asset-tag code, and no new random code can be created. Set through set_inventory_numbered_codes_only().';

-- tenants is not writable by authenticated beyond `name`, so the setting is
-- changed through this, as the prefix is. Turning it on needs a prefix: with
-- none, no numbered code can exist, and every item would be saved untagged.
create function public.set_inventory_numbered_codes_only(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_on boolean := coalesce(p_on, false);
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'Not authorized to change how items are labelled';
  end if;
  if v_on and not exists (
    select 1 from public.tenants
     where id = v_tenant_id and inventory_tag_prefix is not null
  ) then
    raise exception 'INVENTORY_TAG_PREFIX_MISSING'
      using hint = 'Set the tag prefix before using numbered codes only.';
  end if;
  update public.tenants set inventory_numbered_codes_only = v_on where id = v_tenant_id;
  return v_on;
end;
$$;

comment on function public.set_inventory_numbered_codes_only(boolean) is
  'Turns numbered codes only (#1541) on or off for the current tenant. Turning it on needs a numbered-tag prefix. inventory:manage.';

revoke execute on function public.set_inventory_numbered_codes_only(boolean) from public, anon;
grant execute on function public.set_inventory_numbered_codes_only(boolean) to authenticated;

-- Chatter Snow labels with numbered codes only (docs/tenants.md: a seed names
-- its tenant). A database without it updates nothing, so CI and local
-- development keep random codes at intake.
update public.tenants set inventory_numbered_codes_only = true where slug = 'chatter-snow';

-- ---------------------------------------------------------------------------
-- 2. No new random code
-- ---------------------------------------------------------------------------

-- set_inventory_item_tag_value() from 20260927200000, refusing a new
-- asset-tag row while its tenant is on numbered codes only. Every way a random
-- code is made -- intake, Generate code, Create codes, blank labels -- is an
-- insert through here, so one check covers them all.
create or replace function public.set_inventory_item_tag_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
begin
  if tg_op = 'UPDATE' and (old.kind = 'numbered' or new.kind = 'numbered') then
    if new.kind is distinct from old.kind
       or new.value is distinct from old.value
       or new.number is distinct from old.number then
      raise exception 'A numbered code cannot be renumbered or changed to another kind';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' and new.kind = 'asset_tag' and exists (
    select 1 from public.tenants
     where id = new.tenant_id and inventory_numbered_codes_only
  ) then
    raise exception 'INVENTORY_RANDOM_CODES_OFF'
      using hint = 'This organization labels items with numbered codes only.';
  end if;

  if new.kind = 'numbered' then
    select inventory_tag_prefix into v_prefix
      from public.tenants
     where id = new.tenant_id
       for update;
    if v_prefix is null then
      raise exception 'INVENTORY_TAG_PREFIX_MISSING'
        using hint = 'Set the tag prefix before generating numbered codes.';
    end if;
    select coalesce(max(number), 0) + 1 into new.number
      from public.inventory_item_tags
     where tenant_id = new.tenant_id and kind = 'numbered';
    new.value := public.format_numbered_inventory_tag(v_prefix, new.number);
  elsif new.kind = 'asset_tag' then
    if new.value is null or btrim(new.value) = '' then
      new.value := public.generate_inventory_asset_tag(new.tenant_id);
    else
      new.value := upper(btrim(new.value));
    end if;
  elsif new.kind = 'nfc' and new.value is not null then
    -- Web NFC reports a serial in lower case ("04:a2:3b:..."); the lookup
    -- compares upper case.
    new.value := upper(btrim(new.value));
  elsif new.value is not null then
    new.value := btrim(new.value);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Intake
-- ---------------------------------------------------------------------------

-- create_donation_with_items and inventory_intake_scan from 20260928090000.
-- On numbered codes only, intake binds a scanned free numbered code as
-- before, saves an item with nothing scanned untagged (a null in
-- asset_tags), and refuses a random code with its own hint,
-- asset_tag_not_numbered, so the form can say why.
create or replace function public.create_donation_with_items(
  p_donor_name text,
  p_donor_is_anonymous boolean,
  p_donor_source_type text,
  p_donor_email text,
  p_donor_phone text,
  p_donor_notes text,
  p_items jsonb,
  p_event_id uuid default null,
  p_donated_at date default null
)
returns table (
  donation_id uuid,
  inventory_item_ids uuid[],
  giveaway_id uuid,
  untiered_item_ids uuid[],
  asset_tags text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donor_id uuid;
  v_donation_id uuid;
  v_item_id uuid;
  v_item jsonb;
  v_item_ids uuid[] := '{}';
  v_giveaway_id uuid;
  v_tier_id uuid;
  v_tier_key text;
  v_untiered uuid[] := '{}';
  v_category_id uuid;
  v_tier_text text;
  v_tenant_id uuid := public.current_tenant_id();
  v_asset_tag text;
  v_barcode text;
  v_code text;
  v_codes text[] := '{}';
  v_numbered_only boolean;
begin
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one item is required';
  end if;

  if p_event_id is not null and not exists (
    select 1 from public.events where id = p_event_id and tenant_id = v_tenant_id
  ) then
    raise exception 'Event not found';
  end if;

  v_numbered_only := coalesce(
    (select t.inventory_numbered_codes_only from public.tenants t where t.id = v_tenant_id),
    false
  );

  if p_donor_is_anonymous or p_donor_email is null or p_donor_email = '' then
    insert into public.people (name, is_anonymous, source_type, email, phone, notes)
    values (p_donor_name, p_donor_is_anonymous, p_donor_source_type, p_donor_email, p_donor_phone, p_donor_notes)
    returning id into v_donor_id;
  else
    v_donor_id := public.resolve_or_create_person_by_email(
      p_donor_name, p_donor_email, p_donor_phone, p_donor_notes, p_donor_source_type, null
    );
  end if;

  -- The caller's own calendar day, not the database's. `current_date` on a
  -- UTC server is already tomorrow for anyone recording an evening intake west
  -- of Greenwich, which is exactly when gear arrives -- at an event, after
  -- dark. It stays as the fallback for a direct SQL insert that names no day.
  insert into public.donations (donor_id, event_id, donated_at)
  values (v_donor_id, p_event_id, coalesce(p_donated_at, current_date))
  returning id into v_donation_id;

  if p_event_id is not null then
    select g.id into v_giveaway_id
    from public.giveaways g
    where g.event_id = p_event_id
      and g.tenant_id = v_tenant_id
      and exists (select 1 from public.giveaway_tiers t where t.giveaway_id = g.id);
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_category_id := null;
    if nullif(v_item->>'category_key', '') is not null then
      select c.id into v_category_id
      from public.inventory_categories c
      where c.key = v_item->>'category_key'
        and c.tenant_id = v_tenant_id;
    end if;
    if v_category_id is null then
      v_category_id := public.resolve_inventory_category(v_item->>'type', v_tenant_id);
    end if;

    -- created_at from the clock rather than the transaction (#1420): every
    -- item in one donation otherwise shares now(), and the labels printed for
    -- the donation (inventory_intake_labels) have to come out in the order the
    -- items were entered, which is the order they are on the table.
    insert into public.inventory_items
      (donation_id, description, size, type, gender, condition, face_value, notes, intended_use, category_id, photo_url, created_at)
    values (
      v_donation_id,
      v_item->>'description',
      v_item->>'size',
      v_item->>'type',
      v_item->>'gender',
      v_item->>'condition',
      nullif(v_item->>'face_value', '')::numeric,
      v_item->>'notes',
      coalesce(nullif(v_item->>'intended_use', ''), 'gear_library'),
      v_category_id,
      -- Anything that isn't an http(s) URL is dropped rather than stored; see
      -- 20260907170000.
      case when v_item->>'photo_url' ~ '^https?://' then v_item->>'photo_url' end,
      clock_timestamp()
    )
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);

    insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason)
    values (v_item_id, 'received', 1, 'Donation intake');

    -- The item's code (#1420). A pre-printed blank label scanned at intake is
    -- bound to it; otherwise a new code is generated -- unless the tenant
    -- labels with numbered codes only (#1541), when the item is saved
    -- untagged and its code is null in asset_tags. A code that is not an
    -- unassigned label of this tenant -- mistyped, already on another item,
    -- retired because its tag was damaged or lost (#1450), or scanned twice
    -- in this donation -- fails the whole donation rather than quietly
    -- issuing a different code than the one stuck on the item.
    v_asset_tag := upper(nullif(btrim(v_item->>'asset_tag'), ''));
    if v_asset_tag is not null then
      if not v_numbered_only then
        update public.inventory_item_tags
           set item_id = v_item_id
         where tenant_id = v_tenant_id
           and kind = 'asset_tag'
           and value = v_asset_tag
           and item_id is null
           and retired_at is null
        returning value into v_code;
      end if;
      -- A reusable numbered code (#1444) that is free now. `7`, `007` and
      -- `CSN-007` all name it; another tenant's prefix names nothing.
      if v_code is null then
        update public.inventory_item_tags
           set item_id = v_item_id
         where tenant_id = v_tenant_id
           and kind = 'numbered'
           and number = public.inventory_numbered_tag_number(v_asset_tag)
           and item_id is null
           and retired_at is null
        returning value into v_code;
      end if;
      if v_code is null then
        if exists (
          select 1 from public.inventory_item_tags t
           where t.tenant_id = v_tenant_id
             and t.retired_at is not null
             and (
               (t.kind = 'asset_tag' and t.value = v_asset_tag)
               or (t.kind = 'numbered' and t.number = public.inventory_numbered_tag_number(v_asset_tag))
             )
        ) then
          raise exception 'Label % was retired as damaged or lost', v_asset_tag
            using errcode = 'P0001', hint = 'asset_tag_unavailable';
        end if;
        if v_numbered_only and exists (
          select 1 from public.inventory_item_tags t
           where t.tenant_id = v_tenant_id
             and t.kind = 'asset_tag'
             and t.value = v_asset_tag
        ) then
          raise exception 'Label % is a random code, and this organization labels items with numbered codes only', v_asset_tag
            using errcode = 'P0001', hint = 'asset_tag_not_numbered';
        end if;
        raise exception 'Label % is not an unused label or a free numbered code', v_asset_tag
          using errcode = 'P0001', hint = 'asset_tag_unavailable';
      end if;
    elsif not v_numbered_only then
      insert into public.inventory_item_tags (tenant_id, item_id, kind, value)
      values (v_tenant_id, v_item_id, 'asset_tag', '')
      returning value into v_code;
    end if;
    v_codes := array_append(v_codes, v_code);
    v_code := null;

    -- A manufacturer barcode read off the item as it arrived. Not unique: the
    -- same UPC on twenty pairs of gloves is twenty rows.
    v_barcode := nullif(btrim(v_item->>'barcode'), '');
    if v_barcode is not null then
      insert into public.inventory_item_tags (tenant_id, item_id, kind, value)
      values (v_tenant_id, v_item_id, 'barcode', v_barcode);
    end if;

    if v_giveaway_id is not null then
      v_tier_id := null;
      v_tier_key := nullif(v_item->>'giveaway_tier', '');

      if v_tier_key is not null then
        select t.id into v_tier_id
        from public.giveaway_tiers t
        where t.giveaway_id = v_giveaway_id and t.key = v_tier_key;
      end if;

      if v_tier_id is null then
        select concat_ws(' ', g.label, c.label, v_item->>'type')
        into v_tier_text
        from public.inventory_categories c
        join public.inventory_category_groups g on g.id = c.group_id
        where c.id = v_category_id;

        v_tier_id := public.suggest_giveaway_tier(
          v_giveaway_id, coalesce(v_tier_text, v_item->>'type')
        );
      end if;

      if v_tier_id is null then
        v_untiered := array_append(v_untiered, v_item_id);
      else
        perform public.grant_giveaway_tickets(
          v_giveaway_id, v_tier_id, 1, v_donation_id, v_item_id, null
        );
      end if;
    end if;
  end loop;

  return query select v_donation_id, v_item_ids, v_giveaway_id, v_untiered, v_codes;
end;
$$;


create or replace function public.inventory_intake_scan(p_asset_tag text, p_barcode text)
returns table (
  asset_tag_status text,
  barcode_known boolean,
  barcode_description text,
  barcode_category_key text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_code text := upper(nullif(btrim(p_asset_tag), ''));
  v_barcode text := nullif(btrim(p_barcode), '');
  v_item_id uuid;
  v_numbered_only boolean;
begin
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  v_numbered_only := coalesce(
    (select t.inventory_numbered_codes_only from public.tenants t where t.id = v_tenant_id),
    false
  );

  asset_tag_status := null;
  if v_code is not null then
    -- A tenant on numbered codes only (#1541) binds nothing else at intake:
    -- a random code, in any state, is 'not_numbered' -- unless the same
    -- string is also one of its numbered codes, which is looked up first.
    if not v_numbered_only then
      select case
               when t.retired_at is not null then 'retired'
               when t.item_id is null then 'blank'
               else 'assigned'
             end
        into asset_tag_status
        from public.inventory_item_tags t
       where t.tenant_id = v_tenant_id and t.kind = 'asset_tag' and t.value = v_code;
    end if;
    -- Then a reusable numbered code (#1444), typed with or without its
    -- prefix. A random code is looked up first: `234567` can be either.
    if asset_tag_status is null then
      select case
               when t.retired_at is not null then 'retired'
               when t.item_id is null then 'blank'
               else 'assigned'
             end
        into asset_tag_status
        from public.inventory_item_tags t
       where t.tenant_id = v_tenant_id
         and t.kind = 'numbered'
         and t.number = public.inventory_numbered_tag_number(v_code);
    end if;
    if asset_tag_status is null and v_numbered_only and exists (
      select 1 from public.inventory_item_tags t
       where t.tenant_id = v_tenant_id and t.kind = 'asset_tag' and t.value = v_code
    ) then
      asset_tag_status := 'not_numbered';
    end if;
    asset_tag_status := coalesce(asset_tag_status, 'unknown');
  end if;

  barcode_known := false;
  if v_barcode is not null then
    select t.item_id into v_item_id
      from public.inventory_item_tags t
     where t.tenant_id = v_tenant_id and t.kind = 'barcode' and t.value = v_barcode
     order by t.created_at desc
     limit 1;
    if v_item_id is not null then
      barcode_known := true;
      select i.description, c.key
        into barcode_description, barcode_category_key
        from public.inventory_items i
        left join public.inventory_categories c on c.id = i.category_id
       where i.id = v_item_id and i.tenant_id = v_tenant_id;
    end if;
  end if;

  return next;
end;
$$;



comment on function public.inventory_intake_scan(text, text) is
  'What a string scanned at intake is (#1420 part 4): an asset-tag or numbered code''s status (blank / assigned / retired / not_numbered / unknown; not_numbered is a random code on a tenant using numbered codes only, #1541) and, for a manufacturer barcode, the description and category of the latest item carrying it. finance:manage or inventory_intake:manage.';
