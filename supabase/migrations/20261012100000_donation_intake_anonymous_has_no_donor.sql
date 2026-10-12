-- In-kind intake stops creating people it cannot name (#1592).
--
-- An anonymous donation has no donor: donations.donor_id is null, and readers
-- label it "Anonymous" -- as monetary_donations already do. Until now every
-- anonymous gift inserted its own nameless `people` row (is_anonymous), one
-- per gift, which filled People with blanks. A named donor is picked from
-- People in the form and passed as p_donor_id instead of being retyped, so a
-- walk-in without an email stops getting a new row on every visit.
--
-- 1. donations.donor_id becomes nullable. The (tenant_id, donor_id) foreign
--    key is MATCH SIMPLE, so a null donor is not checked against people.
-- 2. create_donation_with_items gains p_donor_id and p_notes (the donation's
--    own notes; p_donor_notes still only describes a person it creates). The
--    signature changes, so it is dropped first.
-- 3. inventory_item_history returns the donation's donor_id rather than the
--    joined person's id. It is security invoker, so a reader who cannot read
--    the person used to get a null there either way; now a null means the
--    donation has no donor, and a set id with no name means it is hidden.
-- 4. Backfill: donations whose donor is an is_anonymous person lose the
--    donor, and the person is deleted when nothing but donations pointed at
--    it. One referenced from anywhere else is left for review.

alter table public.donations alter column donor_id drop not null;

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
  p_donated_at date default null,
  p_donor_id uuid default null,
  p_notes text default null
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

  -- An anonymous donation has no donor (#1592): "Anonymous" is how a reader
  -- labels a null donor_id, not a person, so nothing is written to people.
  -- A named donor is normally an existing person picked in the form; the
  -- name/email path below is kept for a caller that types one in, and still
  -- inserts when there is no email to match on.
  if p_donor_is_anonymous then
    if p_donor_id is not null then
      raise exception 'An anonymous donation has no donor';
    end if;
    v_donor_id := null;
  elsif p_donor_id is not null then
    if not exists (
      select 1 from public.people where id = p_donor_id and tenant_id = v_tenant_id
    ) then
      raise exception 'Donor not found';
    end if;
    v_donor_id := p_donor_id;
  elsif p_donor_email is null or p_donor_email = '' then
    insert into public.people (name, is_anonymous, source_type, email, phone, notes)
    values (p_donor_name, false, p_donor_source_type, p_donor_email, p_donor_phone, p_donor_notes)
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
  insert into public.donations (donor_id, event_id, donated_at, notes)
  values (v_donor_id, p_event_id, coalesce(p_donated_at, current_date), nullif(btrim(p_notes), ''))
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

revoke execute on function public.create_donation_with_items(text, boolean, text, text, text, text, jsonb, uuid, date, uuid, text) from public, anon;
grant execute on function public.create_donation_with_items(text, boolean, text, text, text, text, jsonb, uuid, date, uuid, text) to authenticated;


create or replace function public.inventory_item_history(p_item_id uuid)
returns table (
  entry_kind text,
  entry_id uuid,
  occurred_at timestamptz,
  donated_on date,
  movement_type text,
  quantity integer,
  reason text,
  notes text,
  event_id uuid,
  event_name text,
  donation_id uuid,
  donor_id uuid,
  donor_name text,
  donor_is_anonymous boolean,
  donor_source_type text,
  intake_route text,
  recipient_id uuid,
  recipient_name text,
  gear_request_id uuid,
  recorded_by uuid,
  as_is_acknowledged_at timestamptz,
  as_is_typed_name text,
  as_is_method text,
  as_is_skipped_reason text,
  as_is_skipped_note text,
  recorded_by_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  with item as (
    select i.id, i.donation_id, i.created_at, i.created_by
      from public.inventory_items i
     where i.id = p_item_id
  ),
  intake as (
    select m.id, m.occurred_at, m.reason, m.event_id, m.created_by
      from public.inventory_movements m
      join item on m.inventory_item_id = item.id
     where m.movement_type = 'received'
     order by m.occurred_at, m.created_at, m.id
     limit 1
  ),
  entries as (
    select
      'donated'::text as entry_kind,
      item.donation_id as entry_id,
      coalesce(intake.occurred_at, item.created_at) as occurred_at,
      d.donated_at as donated_on,
      null::text as movement_type,
      null::integer as quantity,
      null::text as reason,
      d.notes,
      e.id as event_id,
      e.name as event_name,
      d.id as donation_id,
      d.donor_id,
      p.name as donor_name,
      p.is_anonymous as donor_is_anonymous,
      p.source_type as donor_source_type,
      case intake.reason
        when 'Donation intake' then 'intake_form'
        when 'Sponsor contribution' then 'event_sponsor'
      end as intake_route,
      null::uuid as recipient_id,
      null::text as recipient_name,
      null::uuid as gear_request_id,
      coalesce(d.created_by, intake.created_by, item.created_by) as recorded_by,
      null::timestamptz as as_is_acknowledged_at,
      null::text as as_is_typed_name,
      null::text as as_is_method,
      null::text as as_is_skipped_reason,
      null::text as as_is_skipped_note
    from item
    left join intake on true
    left join public.donations d on d.id = item.donation_id
    left join public.people p on p.id = d.donor_id
    left join public.events e on e.id = coalesce(d.event_id, intake.event_id)

    union all

    select
      'movement',
      m.id,
      m.occurred_at,
      null,
      m.movement_type,
      m.quantity,
      m.reason,
      m.notes,
      e.id,
      e.name,
      null,
      null,
      null,
      null,
      null,
      null,
      r.id,
      r.name,
      g.id,
      m.created_by,
      coalesce(a.acknowledged_at, held.as_is_acknowledged_at),
      a.typed_name,
      coalesce(a.method, case when held.as_is_acknowledged_at is not null then 'gear_request' end),
      a.skipped_reason,
      a.skipped_note
    from public.inventory_movements m
    join item on m.inventory_item_id = item.id
    left join public.events e on e.id = m.event_id
    left join public.people r on r.id = m.recipient_person_id
    left join public.gear_requests g on g.id = m.gear_request_id
    left join public.distribution_acknowledgements a on a.id = m.distribution_acknowledgement_id
    -- A handout with no acknowledgement of its own that fulfilled a request
    -- carrying one (#1519, step 3 skipped).
    left join lateral (
      select hg.as_is_acknowledged_at
        from public.inventory_movements hm
        join public.gear_requests hg on hg.id = hm.gear_request_id
       where hm.inventory_item_id = m.inventory_item_id
         and hm.movement_type = 'reserved'
         and hm.occurred_at <= m.occurred_at
       order by hm.occurred_at desc, hm.created_at desc
       limit 1
    ) held on m.movement_type = 'distributed' and m.distribution_acknowledgement_id is null
    where m.id is distinct from (select intake.id from intake)

    union all

    select
      'tag_assigned', a.id, a.assigned_at, null, null, null, t.value, null,
      null, null, null, null, null, null, null, null, null, null, null,
      a.assigned_by, null, null, null, null, null
    from public.inventory_item_tag_assignments a
    join item on a.item_id = item.id
    join public.inventory_item_tags t on t.id = a.tag_id

    union all

    select
      'tag_released', a.id, a.released_at, null, null, null, t.value,
      a.release_reason,
      null, null, null, null, null, null, null, null, null, null, null,
      a.released_by, null, null, null, null, null
    from public.inventory_item_tag_assignments a
    join item on a.item_id = item.id
    join public.inventory_item_tags t on t.id = a.tag_id
    where a.released_at is not null
  )
  select entries.*, public.inventory_actor_name(entries.recorded_by)
    from entries
   order by (entries.entry_kind = 'donated'), entries.occurred_at desc,
     entries.entry_id;
$$;



-- Backfill. Every foreign key into people is checked generically -- by the
-- column that references people.id, since most are (tenant_id, person) pairs
-- -- so a person with any other history (a retention-anonymized volunteer,
-- say) is kept. person_role_tags only describes the person and cascades.
do $$
declare
  v_ids uuid[];
  v_fk record;
  v_referenced uuid[];
begin
  select array_agg(distinct p.id) into v_ids
    from public.people p
    join public.donations d on d.donor_id = p.id
   where p.is_anonymous;

  if v_ids is null then
    return;
  end if;

  update public.donations set donor_id = null where donor_id = any(v_ids);

  for v_fk in
    select c.conrelid::regclass as tbl, a.attname as col
      from pg_constraint c
      cross join lateral unnest(c.conkey, c.confkey) as k(src, dst)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.src
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = k.dst
     where c.contype = 'f'
       and c.confrelid = 'public.people'::regclass
       and pa.attname = 'id'
       and c.conrelid <> 'public.person_role_tags'::regclass
  loop
    execute format(
      'select array_agg(distinct %I) from %s where %I = any($1)',
      v_fk.col, v_fk.tbl, v_fk.col
    ) into v_referenced using v_ids;
    if v_referenced is not null then
      v_ids := array(select unnest(v_ids) except select unnest(v_referenced));
    end if;
  end loop;

  delete from public.people where id = any(v_ids);
end;
$$;
