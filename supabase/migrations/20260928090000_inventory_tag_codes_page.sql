-- The Codes page (#1450): every tag code in one place.
--
-- Codes were managed from several places and listed in none: numbered codes
-- on their own page (#1444), random asset tags one item at a time, blanks only
-- as the `?codes=` URL of the batch that made them, NFC serials only on their
-- item. And a damaged or lost physical tag had no fix: a free numbered code
-- whose tag is gone kept looking free, so someone could "assign" a tag nobody
-- holds. This adds what one list of every code needs:
--
--   * when each code's label was last printed, and how often;
--   * whether its URL has been written to an NFC tag;
--   * retiring a code whose physical tag is damaged or lost, refused from then
--     on everywhere a code is bound or resolved, and un-retiring it;
--   * the list itself, filtered and paged in the database, since codes grow
--     without bound; and
--   * one code's history: the items it was on, and when it was printed,
--     written, retired and restored.
--
-- Manufacturer barcodes are left out throughout: they aren't ours to print,
-- and one UPC covers many items.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

alter table public.inventory_item_tags
  add column last_printed_at timestamptz,
  add column print_count integer not null default 0,
  add column nfc_written_at timestamptz,
  add column nfc_written_by uuid references auth.users(id),
  add column retired_at timestamptz,
  add column retired_by uuid references auth.users(id),
  add column retired_reason text,
  add column retired_note text,
  add constraint inventory_item_tags_print_count_check check (print_count >= 0),
  add constraint inventory_item_tags_retired_reason_check
    check (retired_reason in ('damaged', 'lost', 'other')),
  add constraint inventory_item_tags_retired_together
    check ((retired_at is null) = (retired_reason is null)),
  -- Only a code we print can be retired, and only while it is on no item: a
  -- numbered code comes off its item as it is retired, and a random code on
  -- an item is the item's identity -- its lost label is reprinted instead.
  add constraint inventory_item_tags_retired_kinds
    check (retired_at is null or kind in ('asset_tag', 'numbered')),
  add constraint inventory_item_tags_retired_unbound
    check (retired_at is null or item_id is null),
  add constraint inventory_item_tags_retired_note_length
    check (retired_note is null or length(retired_note) <= 500),
  -- An NFC serial is the chip itself; there is nothing to write to it.
  add constraint inventory_item_tags_nfc_written_kinds
    check (nfc_written_at is null or kind in ('asset_tag', 'numbered'));

comment on column public.inventory_item_tags.last_printed_at is
  'When a label for this code was last sent to print (#1450): the print button, a Katasymbol print or its saved images. Printed at least this many times, not proof that paper came out.';
comment on column public.inventory_item_tags.print_count is
  'How many times a label for this code was sent to print (#1450). See last_printed_at.';
comment on column public.inventory_item_tags.nfc_written_at is
  'When this code''s tag URL was last written to an NFC tag (#1450): set after a Web NFC write, or by hand on an iPhone, where the tag is written in another app. A numbered code keeps it across items, because the tag holds the code''s URL, not the item''s.';
comment on column public.inventory_item_tags.retired_at is
  'When this code was retired because its physical tag was damaged or lost (#1450). A retired code is on no item, is never bound again, and resolves as unknown. Un-retiring clears it.';

-- The list's own filters: the partial index covers "never printed" and "not
-- written" on the codes worth listing.
create index inventory_item_tags_codes_idx
  on public.inventory_item_tags (tenant_id, kind, number)
  where kind <> 'barcode';

-- ---------------------------------------------------------------------------
-- 2. Recording printing and NFC writes
-- ---------------------------------------------------------------------------

-- Operational metadata, set on the same bar as printing: security definer so
-- that reprinting a label needs no inventory:manage. Printing is recorded by
-- the print button just before the dialog opens -- opening a print view
-- counts for nothing, since nothing there says paper came out. The intake
-- volunteer prints from Donations -> Blank labels and a donation's labels, so
-- the grants that page answers to may record it too.
create function public.record_inventory_labels_printed(p_tag_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not (
    public.has_permission('inventory', 'view')
    or public.has_permission('finance', 'manage')
    or public.has_permission('inventory_intake', 'manage')
  ) then
    raise exception 'Not authorized to print labels';
  end if;
  if coalesce(cardinality(p_tag_ids), 0) = 0 then
    return 0;
  end if;
  if cardinality(p_tag_ids) > 500 then
    raise exception 'Too many labels at once';
  end if;

  update public.inventory_item_tags
     set last_printed_at = now(),
         print_count = print_count + 1
   where tenant_id = public.current_tenant_id()
     and id = any(p_tag_ids)
     and kind in ('asset_tag', 'numbered');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.record_inventory_labels_printed(uuid[]) is
  'Records that labels for these codes were sent to print (#1450): last_printed_at and print_count. inventory:view, finance:manage or inventory_intake:manage.';

revoke execute on function public.record_inventory_labels_printed(uuid[]) from public, anon;
grant execute on function public.record_inventory_labels_printed(uuid[]) to authenticated;

-- Written after a Web NFC write, or marked by hand from an iPhone. p_written
-- false takes the mark back, for a tag marked by mistake.
create function public.set_inventory_tags_nfc_written(
  p_tag_ids uuid[],
  p_written boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.has_permission('inventory', 'view') then
    raise exception 'Not authorized to mark NFC tags';
  end if;
  if coalesce(cardinality(p_tag_ids), 0) = 0 then
    return 0;
  end if;
  if cardinality(p_tag_ids) > 500 then
    raise exception 'Too many codes at once';
  end if;

  update public.inventory_item_tags
     set nfc_written_at = case when p_written then now() end,
         nfc_written_by = case when p_written then auth.uid() end
   where tenant_id = public.current_tenant_id()
     and id = any(p_tag_ids)
     and kind in ('asset_tag', 'numbered')
     and (p_written or nfc_written_at is not null);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.set_inventory_tags_nfc_written(uuid[], boolean) is
  'Marks these codes as written to an NFC tag (#1450), or takes the mark back. inventory:view.';

revoke execute on function public.set_inventory_tags_nfc_written(uuid[], boolean) from public, anon;
grant execute on function public.set_inventory_tags_nfc_written(uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Retiring a damaged or lost code
-- ---------------------------------------------------------------------------

-- One row per code asked for:
--
--   outcome 'retired'  -- done. released_from names the item a numbered code
--                         came off, so the caller can say so.
--   outcome 'already'  -- it was retired already; nothing changed.
--   outcome 'on_item'  -- a random code on an item. Its label is reprinted,
--                         never retired: the code is the item's identity.
--   outcome 'not_ours' -- an NFC serial or a barcode, which we don't print.
--   outcome 'unknown'  -- no such code in this tenant.
--
-- A numbered code's number is not reused: printed copies may still be out
-- there, and #1444 makes numbers permanent. Security invoker: every read and
-- write goes through the tag table's own RLS, which is inventory:manage for a
-- write.
create function public.retire_inventory_tags(
  p_tag_ids uuid[],
  p_reason text,
  p_note text default null
)
returns table (tag_id uuid, code text, outcome text, released_from text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
  v_tag public.inventory_item_tags%rowtype;
  v_item text;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'Not authorized to retire tag codes';
  end if;
  if p_reason is null or p_reason not in ('damaged', 'lost', 'other') then
    raise exception 'INVENTORY_TAG_RETIRE_REASON';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'INVENTORY_TAG_RETIRE_NOTE';
  end if;
  if coalesce(cardinality(p_tag_ids), 0) > 500 then
    raise exception 'Too many codes at once';
  end if;

  foreach v_id in array coalesce(p_tag_ids, '{}') loop
    v_tag := null;
    v_item := null;
    select * into v_tag
      from public.inventory_item_tags t
     where t.tenant_id = v_tenant_id and t.id = v_id
       for update;

    if v_tag.id is null then
      return query select v_id, null::text, 'unknown'::text, null::text;
      continue;
    end if;
    if v_tag.kind not in ('asset_tag', 'numbered') then
      return query select v_id, v_tag.value, 'not_ours'::text, null::text;
      continue;
    end if;
    if v_tag.retired_at is not null then
      return query select v_id, v_tag.value, 'already'::text, null::text;
      continue;
    end if;
    if v_tag.kind = 'asset_tag' and v_tag.item_id is not null then
      return query select v_id, v_tag.value, 'on_item'::text, null::text;
      continue;
    end if;

    if v_tag.item_id is not null then
      select i.description into v_item
        from public.inventory_items i
       where i.tenant_id = v_tenant_id and i.id = v_tag.item_id;
      perform set_config('app.inventory_tag_release_reason', 'retired', true);
      update public.inventory_item_tags set item_id = null where id = v_tag.id;
      perform set_config('app.inventory_tag_release_reason', '', true);
    end if;

    update public.inventory_item_tags
       set retired_at = now(),
           retired_by = auth.uid(),
           retired_reason = p_reason,
           retired_note = v_note
     where id = v_tag.id;

    return query select v_id, v_tag.value, 'retired'::text, v_item;
  end loop;
end;
$$;

comment on function public.retire_inventory_tags(uuid[], text, text) is
  'Retires codes whose physical tag is damaged or lost (#1450): a numbered code comes off its item (release reason retired), and a retired code is never bound again. A random code on an item is refused (outcome on_item). inventory:manage.';

revoke execute on function public.retire_inventory_tags(uuid[], text, text) from public, anon;
grant execute on function public.retire_inventory_tags(uuid[], text, text) to authenticated;

-- "Found it", or a mistake. The code comes back free (or blank), on no item;
-- the audit trail keeps both the retirement and this.
create function public.unretire_inventory_tag(p_tag_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'Not authorized to restore tag codes';
  end if;

  update public.inventory_item_tags
     set retired_at = null,
         retired_by = null,
         retired_reason = null,
         retired_note = null
   where tenant_id = public.current_tenant_id()
     and id = p_tag_id
     and retired_at is not null
  returning value into v_code;

  return v_code;
end;
$$;

comment on function public.unretire_inventory_tag(uuid) is
  'Restores a retired tag code (#1450), free or blank again. Returns the code, or null when it was not retired. inventory:manage.';

revoke execute on function public.unretire_inventory_tag(uuid) from public, anon;
grant execute on function public.unretire_inventory_tag(uuid) to authenticated;

-- A retired code can't be assigned: assign_numbered_inventory_tag from
-- 20260927200000, with outcome 'retired' before anything is changed.
create or replace function public.assign_numbered_inventory_tag(
  p_item_id uuid,
  p_code text,
  p_move boolean default false
)
returns table (outcome text, code text, holder_item_id uuid, holder_description text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_number integer := public.inventory_numbered_tag_number(p_code);
  v_tag public.inventory_item_tags%rowtype;
  v_status text;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'Not authorized to assign tag codes';
  end if;

  select status into v_status
    from public.inventory_items
   where id = p_item_id and tenant_id = v_tenant_id
     for update;
  if not found then
    raise exception 'Inventory item not found';
  end if;

  if v_number is not null then
    select * into v_tag
      from public.inventory_item_tags t
     where t.tenant_id = v_tenant_id and t.kind = 'numbered' and t.number = v_number
       for update;
  end if;
  if v_tag.id is null then
    return query select 'unknown'::text, null::text, null::uuid, null::text;
    return;
  end if;

  -- Its tag is damaged or lost (#1450): whatever is in the person's hand is
  -- not the tag this code was printed on.
  if v_tag.retired_at is not null then
    return query select 'retired'::text, v_tag.value, null::uuid, null::text;
    return;
  end if;
  if v_status in ('distributed', 'retired', 'lost') then
    return query select 'item_gone'::text, v_tag.value, null::uuid, null::text;
    return;
  end if;
  if v_tag.item_id = p_item_id then
    return query select 'already'::text, v_tag.value, p_item_id, null::text;
    return;
  end if;
  if v_tag.item_id is not null and not coalesce(p_move, false) then
    return query
      select 'held'::text, v_tag.value, i.id, i.description
        from public.inventory_items i
       where i.id = v_tag.item_id;
    return;
  end if;

  perform set_config('app.inventory_tag_release_reason', 'replaced', true);
  update public.inventory_item_tags
     set item_id = null
   where tenant_id = v_tenant_id
     and kind = 'numbered'
     and item_id = p_item_id;
  perform set_config('app.inventory_tag_release_reason', '', true);

  update public.inventory_item_tags set item_id = p_item_id where id = v_tag.id;

  return query select 'assigned'::text, v_tag.value, null::uuid, null::text;
end;
$$;

comment on function public.assign_numbered_inventory_tag(uuid, text, boolean) is
  'Puts a numbered tag code (#1444), typed or scanned, on an item. Asks before moving a code another item holds (outcome ''held''; call again with p_move), and refuses a retired one (outcome ''retired'', #1450). inventory:manage.';

-- Intake refuses a retired code: create_donation_with_items and
-- inventory_intake_scan from 20260927200000. A retired blank or numbered code
-- is no longer "unused", and the scan says why rather than "unknown".
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
    -- retired because its tag was damaged or lost (#1450), or scanned twice
    -- in this donation -- fails the whole donation rather than quietly
    -- issuing a different code than the one stuck on the item.
    v_asset_tag := upper(nullif(btrim(v_item->>'asset_tag'), ''));
    if v_asset_tag is not null then
      update public.inventory_item_tags
         set item_id = v_item_id
       where tenant_id = v_tenant_id
         and kind = 'asset_tag'
         and value = v_asset_tag
         and item_id is null
         and retired_at is null
      returning value into v_code;
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
        raise exception 'Label % is not an unused label or a free numbered code', v_asset_tag
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
begin
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  asset_tag_status := null;
  if v_code is not null then
    select case
             when t.retired_at is not null then 'retired'
             when t.item_id is null then 'blank'
             else 'assigned'
           end
      into asset_tag_status
      from public.inventory_item_tags t
     where t.tenant_id = v_tenant_id and t.kind = 'asset_tag' and t.value = v_code;
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
  'What a string scanned at intake is (#1420 part 4): an asset-tag or numbered code''s status (blank / assigned / retired / unknown) and, for a manufacturer barcode, the description and category of the latest item carrying it. finance:manage or inventory_intake:manage.';

-- A retired blank is not printed from the intake page: inventory_intake_labels
-- from 20260923200000, with the blank branch skipping retired codes.
create or replace function public.inventory_intake_labels(p_donation_id uuid, p_codes text[])
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
       and t.retired_at is null
     order by wanted.position;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The list
-- ---------------------------------------------------------------------------

-- Every code but barcodes, filtered and paged here rather than in the
-- browser. Security invoker, so it answers under the tag and item tables' own
-- RLS -- inventory:view, this tenant -- and total_count is the whole filtered
-- count on every row, so one call fills a page and its pager.
--
--   code_kind -- numbered, asset_tag (a random code on an item), blank (a
--                random code on no item) or nfc.
--   state     -- free (a numbered code on no item), blank, on_item, retired.
--
-- Search is by code or by the item's description. A number the caller has
-- already read out of the search (`7`, `csn7`, `CSN-007`, with this tenant's
-- prefix if any; parseCodeSearch() in src/lib/inventory-codes.ts) matches a
-- numbered code by number, since the text alone would miss `CSN-007` for
-- `csn7`.
create function public.inventory_tag_codes(
  p_kinds text[] default null,
  p_states text[] default null,
  p_never_printed boolean default false,
  p_not_written boolean default false,
  p_number_from integer default null,
  p_number_to integer default null,
  p_search text default null,
  p_search_number integer default null,
  p_ids uuid[] default null,
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  id uuid,
  kind text,
  code_kind text,
  state text,
  value text,
  number integer,
  item_id uuid,
  item_description text,
  item_size text,
  last_printed_at timestamptz,
  print_count integer,
  nfc_written_at timestamptz,
  retired_at timestamptz,
  retired_reason text,
  retired_note text,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with codes as (
    select
      t.id,
      t.kind,
      case when t.kind = 'asset_tag' and t.item_id is null then 'blank' else t.kind end as code_kind,
      case
        when t.retired_at is not null then 'retired'
        when t.item_id is not null then 'on_item'
        when t.kind = 'numbered' then 'free'
        else 'blank'
      end as state,
      t.value,
      t.number,
      t.item_id,
      i.description as item_description,
      i.size as item_size,
      t.last_printed_at,
      t.print_count,
      t.nfc_written_at,
      t.retired_at,
      t.retired_reason,
      t.retired_note,
      t.created_at
    from public.inventory_item_tags t
    left join public.inventory_items i
      on i.tenant_id = t.tenant_id and i.id = t.item_id
    where t.tenant_id = (select public.current_tenant_id())
      and t.kind in ('asset_tag', 'numbered', 'nfc')
  ),
  search as (
    select nullif(btrim(coalesce(p_search, '')), '') as term
  ),
  pattern as (
    select '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%' as value
      from search
  )
  select
    c.id, c.kind, c.code_kind, c.state, c.value, c.number,
    c.item_id, c.item_description, c.item_size,
    c.last_printed_at, c.print_count, c.nfc_written_at,
    c.retired_at, c.retired_reason, c.retired_note, c.created_at,
    count(*) over () as total_count
  from codes c, pattern p
  where (p_ids is null or c.id = any(p_ids))
    and (p_kinds is null or c.code_kind = any(p_kinds))
    and (p_states is null or c.state = any(p_states))
    and (not coalesce(p_never_printed, false)
         or (c.print_count = 0 and c.kind in ('asset_tag', 'numbered')))
    and (not coalesce(p_not_written, false)
         or (c.nfc_written_at is null and c.kind in ('asset_tag', 'numbered')))
    and (p_number_from is null or c.number >= p_number_from)
    and (p_number_to is null or c.number <= p_number_to)
    and (
      p.value is null
      or c.value ilike p.value
      or c.item_description ilike p.value
      or (p_search_number is not null and c.number = p_search_number)
    )
  order by (c.kind = 'numbered') desc, c.number, c.created_at desc, c.value, c.id
  limit greatest(least(coalesce(p_limit, 10), 500), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.inventory_tag_codes(text[], text[], boolean, boolean, integer, integer, text, integer, uuid[], integer, integer) is
  'The Codes page''s list (#1450): every numbered, asset-tag, blank and NFC code in this tenant, filtered, searched and paged, with the filtered total on every row. Security invoker: inventory:view through RLS.';

revoke execute on function public.inventory_tag_codes(text[], text[], boolean, boolean, integer, integer, text, integer, uuid[], integer, integer) from public, anon;
grant execute on function public.inventory_tag_codes(text[], text[], boolean, boolean, integer, integer, text, integer, uuid[], integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. One code's history
-- ---------------------------------------------------------------------------

-- The items a code was on, and what happened to its label. Numbered codes
-- read their assignments; a random code or a blank has at most one item, so
-- it shows when that code was bound. Printing, NFC writes and retiring come
-- from audit_log, which inventory readers can't read (#1444) -- hence
-- security definer, answering only for a tag in this tenant, to a reader
-- with inventory:view.
--
--   event -- created, bound, assigned, released, printed, nfc_written,
--            nfc_cleared, retired, unretired.
--   detail -- the release reason for released; the retirement reason (and
--             note, after a colon) for retired.
create function public.inventory_tag_history(p_tag_id uuid)
returns table (
  occurred_at timestamptz,
  event text,
  item_id uuid,
  item_description text,
  detail text,
  actor_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_tag public.inventory_item_tags%rowtype;
begin
  if not public.has_permission('inventory', 'view') then
    raise exception 'Not authorized to read tag history';
  end if;

  select * into v_tag
    from public.inventory_item_tags t
   where t.tenant_id = v_tenant_id and t.id = p_tag_id;
  if v_tag.id is null or v_tag.kind = 'barcode' then
    return;
  end if;

  return query
  with audit as (
    select a.occurred_at, a.action, a.actor_id, a.old_data, a.new_data
      from public.audit_log a
     where a.table_name = 'inventory_item_tags'
       and a.record_id = v_tag.id
  ),
  entries as (
    -- Made. A random code made for its item (intake, Generate code) was
    -- bound in the same moment.
    select v_tag.created_at as occurred_at,
           'created'::text as event,
           case when v_tag.kind <> 'numbered' then (
             select (a.new_data ->> 'item_id')::uuid from audit a
              where a.action = 'insert' limit 1
           ) end as item_id,
           null::text as detail,
           v_tag.created_by as actor_id

    union all

    -- A blank bound at intake: its item_id going from nothing to an item.
    select a.occurred_at, 'bound', (a.new_data ->> 'item_id')::uuid, null, a.actor_id
      from audit a
     where v_tag.kind <> 'numbered'
       and a.action = 'update'
       and a.old_data ->> 'item_id' is null
       and a.new_data ->> 'item_id' is not null

    union all

    select s.assigned_at, 'assigned', s.item_id, null, s.assigned_by
      from public.inventory_item_tag_assignments s
     where s.tenant_id = v_tenant_id and s.tag_id = v_tag.id

    union all

    select s.released_at, 'released', s.item_id, s.release_reason, s.released_by
      from public.inventory_item_tag_assignments s
     where s.tenant_id = v_tenant_id and s.tag_id = v_tag.id
       and s.released_at is not null

    union all

    select a.occurred_at, 'printed', null, null, a.actor_id
      from audit a
     where a.action = 'update'
       and (a.new_data ->> 'print_count')::integer
           > coalesce((a.old_data ->> 'print_count')::integer, 0)

    union all

    select a.occurred_at,
           case when a.new_data ->> 'nfc_written_at' is null then 'nfc_cleared' else 'nfc_written' end,
           null, null, a.actor_id
      from audit a
     where a.action = 'update'
       and a.new_data ->> 'nfc_written_at' is distinct from a.old_data ->> 'nfc_written_at'

    union all

    select a.occurred_at,
           case when a.new_data ->> 'retired_at' is null then 'unretired' else 'retired' end,
           null,
           case when a.new_data ->> 'retired_at' is not null then
             concat_ws(': ', a.new_data ->> 'retired_reason', nullif(a.new_data ->> 'retired_note', ''))
           end,
           a.actor_id
      from audit a
     where a.action = 'update'
       and a.new_data ->> 'retired_at' is distinct from a.old_data ->> 'retired_at'
  )
  select e.occurred_at,
         e.event,
         e.item_id,
         i.description,
         e.detail,
         coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
           u.email
         )::text
    from entries e
    left join public.inventory_items i
      on i.tenant_id = v_tenant_id and i.id = e.item_id
    left join auth.users u on u.id = e.actor_id
   -- Newest first; within one transaction, a release before the assignment
   -- that followed it, and a retirement after the release it caused.
   order by e.occurred_at desc,
     case e.event
       when 'retired' then 0 when 'assigned' then 1 when 'released' then 2
       else 3
     end;
end;
$$;

comment on function public.inventory_tag_history(uuid) is
  'One tag code''s history (#1450): the items it was on, when, and why it came off, with its printing, NFC writes, retirement and restoration from audit_log. Only for a code in this tenant. inventory:view.';

revoke execute on function public.inventory_tag_history(uuid) from public, anon;
grant execute on function public.inventory_tag_history(uuid) to authenticated;
