-- Issue #748: two double-spend races the integration suite had no case for,
-- because every existing test awaited one call before making the next.
--
-- 1. register_for_event counted the seats already taken with a plain
--    `select sum(party_size) from event_registrations`. Under read committed
--    two overlapping registrations both take that sum before either has
--    inserted, so both see room and both are seated: four concurrent requests
--    against a two-seat event produced three registrations. Nothing about the
--    statement is wrong in isolation -- the missing piece is that nothing
--    serializes the read against the insert. Locking the event row does, and
--    only for events that actually have a capacity, so an uncapped event's
--    registrations stay fully parallel.
--
-- 2. record_event_distribution checked only that the inventory item existed.
--    Two staffers handing out the same last jacket from two stale pickers
--    both wrote a 'distributed' movement and both set the item's status, so
--    the ledger showed the item given away twice. The item row is now locked
--    and re-checked, which both serializes the pair and gives the loser a
--    specific refusal to show. The guard is deliberately limited to callers
--    that claim the item (p_mark_item_distributed): the partial-quantity path
--    leaves the item on the shelf on purpose and must keep being able to
--    record repeat movements against it.
--
-- Both follow request_gear_items (20260826370000), the one allocation path
-- that already got this right: lock, then re-read, then mutate.

create or replace function public.register_for_event(
  p_event_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_party_size integer,
  p_notes text,
  p_honeypot text default null,
  p_ip_address inet default null,
  p_instagram_handle text default null,
  p_pronouns text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event record;
  v_existing_party_size integer;
  v_registration_id uuid;
  v_person_id uuid;
  v_pronouns text := nullif(btrim(p_pronouns), '');
  v_tenant_id uuid := public.public_tenant_id();
begin
  if not public.check_rate_limit('register_for_event', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  if p_honeypot is not null and p_honeypot <> '' then
    return gen_random_uuid();
  end if;

  if v_tenant_id is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  select capacity, registration_enabled, registration_deadline, auto_assign_discount_codes
  into v_event
  from public.events
  where id = p_event_id
    and tenant_id = v_tenant_id
    and visibility = 'public'
    and status = 'published';

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not v_event.registration_enabled then
    raise exception 'REGISTRATION_CLOSED';
  end if;

  if v_event.registration_deadline is not null and v_event.registration_deadline < now() then
    raise exception 'REGISTRATION_DEADLINE_PASSED';
  end if;

  if p_party_size is null or p_party_size < 1 then
    raise exception 'INVALID_PARTY_SIZE';
  end if;

  if char_length(v_pronouns) > 40 then
    raise exception 'PRONOUNS_TOO_LONG';
  end if;

  if v_event.capacity is not null then
    -- Take the event row before counting seats, so concurrent registrations
    -- queue behind each other and every one of them sums a table that already
    -- contains the ones ahead of it. Held until this transaction commits,
    -- which is what makes the check below binding rather than advisory. Only
    -- capped events pay for it; an uncapped event never reaches this branch.
    perform 1 from public.events
     where id = p_event_id and tenant_id = v_tenant_id
     for update;

    select coalesce(sum(party_size), 0) into v_existing_party_size
    from public.event_registrations
    where event_id = p_event_id;

    if v_existing_party_size + p_party_size > v_event.capacity then
      raise exception 'EVENT_AT_CAPACITY';
    end if;
  end if;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, null, 'other', null, p_instagram_handle, v_pronouns, v_tenant_id
  );

  insert into public.event_registrations
    (tenant_id, event_id, name, email, phone, party_size, notes, person_id, instagram_handle, pronouns)
  values
    (v_tenant_id, p_event_id, p_name, p_email, p_phone, p_party_size, p_notes, v_person_id, p_instagram_handle, v_pronouns)
  returning id into v_registration_id;

  if v_event.auto_assign_discount_codes then
    update public.discount_codes
    set registration_id = v_registration_id,
        assigned_at = now()
    where id = (
      select id
      from public.discount_codes
      where event_id = p_event_id
        and registration_id is null
      order by created_at asc
      for update skip locked
      limit 1
    );
  end if;

  return v_registration_id;
exception
  when unique_violation then
    raise exception 'ALREADY_REGISTERED';
end;
$$;

create or replace function public.record_event_distribution(
  p_inventory_item_id uuid,
  p_quantity integer,
  p_reason text,
  p_event_id uuid default null,
  p_recipient_person_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_mark_item_distributed boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_status text;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a distribution';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select status into v_status
  from public.inventory_items
  where id = p_inventory_item_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Inventory item not found';
  end if;

  -- Only a caller claiming the item is refused. A 'reserved' item is fair
  -- game: fulfilling a gear-library request is exactly a distribution of one.
  if p_mark_item_distributed and v_status = 'distributed' then
    raise exception 'ITEM_ALREADY_DISTRIBUTED';
  end if;

  insert into public.inventory_movements
    (inventory_item_id, movement_type, quantity, occurred_at, reason, event_id, recipient_person_id)
  values
    (p_inventory_item_id, 'distributed', p_quantity, coalesce(p_occurred_at, now()), p_reason, p_event_id, p_recipient_person_id)
  returning id into v_movement_id;

  if p_mark_item_distributed then
    update public.inventory_items set status = 'distributed'
     where id = p_inventory_item_id and tenant_id = v_tenant_id;
  end if;

  return v_movement_id;
end;
$$;
