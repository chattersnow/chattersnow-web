-- Scannable inventory tags, part 4: tagging at intake (#1420).
--
-- Part 1 made the tag table and left intake to this part: a donated item is
-- never supposed to go on the shelf without a code, and the code has to be
-- created by the same write that creates the item, or a network drop between
-- the two leaves exactly the untagged item this is meant to prevent.
--
-- Intake is the `inventory_intake` Workflow carve-out: the volunteer at the
-- intake table holds inventory_intake:manage and no access to the item catalog
-- (inventory_items and inventory_item_tags select both need more). Everything
-- here is therefore a `security definer` function gated on the same pair that
-- gates create_donation_with_items itself -- finance:manage or
-- inventory_intake:manage -- and none of it needs inventory:manage.
--
--   1. create_donation_with_items gives every new item an asset-tag code in
--      the same transaction and returns the codes. An item may instead name a
--      pre-printed blank label to bind, and a manufacturer barcode to record.
--   2. create_blank_asset_tags() makes a batch of unassigned codes to print
--      ahead of an intake day. Part 1 already chose where they live: an
--      asset_tag row with no item_id.
--   3. inventory_intake_scan() tells the intake form what a scanned string is
--      -- a blank label, a label already on an item, or a barcode, with the
--      name and category of an item already carrying it -- without handing an
--      intake volunteer the catalog.
--   4. inventory_intake_labels() reads back what the label page needs for the
--      items of one donation, or for a list of blank codes.

-- ---------------------------------------------------------------------------
-- 1. create_donation_with_items: codes, blank labels and barcodes
-- ---------------------------------------------------------------------------
--
-- Copied from 20260915000000, as every change to this function has been. The
-- differences: the return type gains `asset_tags` (in the same order as
-- `inventory_item_ids`), and each item's optional `asset_tag` and `barcode`
-- keys are handled after it is inserted. The return type changes, so the
-- function is dropped rather than replaced.

drop function if exists public.create_donation_with_items(text, boolean, text, text, text, text, jsonb, uuid, date);

create function public.create_donation_with_items(
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
    -- bound to it; otherwise a new code is generated. Either way it happens
    -- here, so a received item is never left untagged. A code that is not an
    -- unassigned label of this tenant -- mistyped, already on another item,
    -- or scanned twice in this donation -- fails the whole donation rather
    -- than quietly issuing a different code than the one stuck on the item.
    v_asset_tag := upper(nullif(btrim(v_item->>'asset_tag'), ''));
    if v_asset_tag is not null then
      update public.inventory_item_tags
         set item_id = v_item_id
       where tenant_id = v_tenant_id
         and kind = 'asset_tag'
         and value = v_asset_tag
         and item_id is null
      returning value into v_code;
      if v_code is null then
        raise exception 'Label % is not an unused label', v_asset_tag
          using errcode = 'P0001', hint = 'asset_tag_unavailable';
      end if;
    else
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

revoke execute on function public.create_donation_with_items(text, boolean, text, text, text, text, jsonb, uuid, date) from public, anon;
grant execute on function public.create_donation_with_items(text, boolean, text, text, text, text, jsonb, uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pre-printed blank labels
-- ---------------------------------------------------------------------------

-- A batch of unassigned codes, for a sheet printed before the gear arrives.
-- Intake may make them as well as inventory managers: printing labels for the
-- intake table is part of running it. Capped at one print run's worth
-- (MAX_LABEL_ITEMS in src/lib/inventory-labels.ts).
create function public.create_blank_asset_tags(p_count integer)
returns table (id uuid, value text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not (
    public.has_permission('inventory', 'manage')
    or public.has_permission('finance', 'manage')
    or public.has_permission('inventory_intake', 'manage')
  ) then
    raise exception 'Not authorized to create labels';
  end if;
  if p_count is null or p_count < 1 or p_count > 150 then
    raise exception 'Choose between 1 and 150 labels';
  end if;

  return query
  insert into public.inventory_item_tags (tenant_id, item_id, kind, value)
  select v_tenant_id, null, 'asset_tag', ''
  from generate_series(1, p_count)
  returning inventory_item_tags.id, inventory_item_tags.value;
end;
$$;

comment on function public.create_blank_asset_tags(integer) is
  'Creates p_count unassigned asset-tag codes (#1420 part 4) to print as blank labels ahead of intake. inventory:manage, finance:manage or inventory_intake:manage.';

revoke execute on function public.create_blank_asset_tags(integer) from public, anon;
grant execute on function public.create_blank_asset_tags(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. What a scan at intake is
-- ---------------------------------------------------------------------------

-- The intake form cannot use the part 1 lookup: it runs under RLS, and an
-- intake volunteer can read neither items nor tags. This answers only what
-- the form needs, for callers who may record a donation:
--
--   * p_asset_tag -- 'blank' for an unassigned label of this tenant,
--     'assigned' for one already on an item, 'unknown' otherwise. Nothing
--     about the item a label is on.
--   * p_barcode -- whether any item already carries that barcode, and if so
--     the description and category of the most recent one, so the form can
--     prefill a second pair of the same gloves. That is the one piece of the
--     catalog intake sees, and only for a barcode physically in hand.
create function public.inventory_intake_scan(p_asset_tag text, p_barcode text)
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
begin
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  asset_tag_status := null;
  if v_code is not null then
    select case when t.item_id is null then 'blank' else 'assigned' end
      into asset_tag_status
      from public.inventory_item_tags t
     where t.tenant_id = v_tenant_id and t.kind = 'asset_tag' and t.value = v_code;
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
  'What a string scanned at intake is (#1420 part 4): an asset-tag code''s status (blank / assigned / unknown) and, for a manufacturer barcode, the description and category of the latest item carrying it. finance:manage or inventory_intake:manage.';

revoke execute on function public.inventory_intake_scan(text, text) from public, anon;
grant execute on function public.inventory_intake_scan(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Labels for intake
-- ---------------------------------------------------------------------------

-- The label page under Inventory -> Donations prints either one donation's
-- items or a list of blank codes. Its readers include the intake volunteer,
-- so the rows come through here rather than through RLS: the item's
-- description, size and code -- what is printed on the label, and nothing
-- else. Blank codes come back only while they are still blank.
create function public.inventory_intake_labels(p_donation_id uuid, p_codes text[])
returns table (tag_id uuid, item_id uuid, code text, description text, size text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not (
    public.has_permission('inventory', 'view')
    or public.has_permission('finance', 'manage')
    or public.has_permission('inventory_intake', 'manage')
  ) then
    raise exception 'Not authorized to print labels';
  end if;

  if p_donation_id is not null then
    return query
    select t.id, i.id, t.value, i.description, i.size
      from public.inventory_items i
      join public.inventory_item_tags t
        on t.tenant_id = i.tenant_id and t.item_id = i.id and t.kind = 'asset_tag'
     where i.tenant_id = v_tenant_id and i.donation_id = p_donation_id
     order by i.created_at, i.id;
  end if;

  if p_codes is not null then
    return query
    select t.id, null::uuid, t.value, null::text, null::text
      from unnest(p_codes) with ordinality as wanted(code, position)
      join public.inventory_item_tags t
        on t.tenant_id = v_tenant_id
       and t.kind = 'asset_tag'
       and t.value = upper(btrim(wanted.code))
       and t.item_id is null
     order by wanted.position;
  end if;
end;
$$;

comment on function public.inventory_intake_labels(uuid, text[]) is
  'Label rows for the intake label page (#1420 part 4): a donation''s items with their codes, or the given codes while still unassigned. inventory:view, finance:manage or inventory_intake:manage.';

revoke execute on function public.inventory_intake_labels(uuid, text[]) from public, anon;
grant execute on function public.inventory_intake_labels(uuid, text[]) to authenticated;
