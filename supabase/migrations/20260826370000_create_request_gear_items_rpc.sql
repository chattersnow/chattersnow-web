-- Issue #247: gear library cart -- request multiple items in one submission
-- instead of repeating the single-item flow (request_gear_item, #170) once
-- per item. Models request_gear_item closely, plus the honeypot/rate-limit
-- pattern added to register_for_event/submit_volunteer_application after
-- request_gear_item shipped (20260826170000-20260826200000), since this is
-- a new public write path and should launch with the same protection.
--
-- All-or-nothing: every requested item is locked and checked for
-- availability *before* any row is mutated, so a request that includes one
-- already-taken item fails as a whole (ITEM_ALREADY_REQUESTED) rather than
-- silently reserving a subset. Items are locked in a stable (sorted) order
-- across all callers to avoid deadlocking two concurrent multi-item
-- requests that share an item.
create function public.request_gear_items(
  p_inventory_item_ids uuid[],
  p_name text,
  p_email text,
  p_phone text,
  p_notes text default null,
  p_honeypot text default null,
  p_ip_address inet default null
) returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_status text;
  v_person_id uuid;
  v_movement_id uuid;
  v_movement_ids uuid[] := '{}';
begin
  if not public.check_rate_limit('request_gear_items', p_ip_address, 8, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  -- Honeypot: a field real users never see or fill; bots that autofill
  -- every input trip it. Report a fake success so probing bots learn
  -- nothing was rejected.
  if p_honeypot is not null and p_honeypot <> '' then
    return array[gen_random_uuid()];
  end if;

  if p_inventory_item_ids is null or array_length(p_inventory_item_ids, 1) is null then
    raise exception 'NO_ITEMS';
  end if;

  for v_item_id in select unnest(p_inventory_item_ids) order by 1
  loop
    select status into v_status
    from public.inventory_items
    where id = v_item_id
    for update;

    if not found then
      raise exception 'ITEM_NOT_FOUND';
    end if;

    if v_status <> 'available' then
      raise exception 'ITEM_ALREADY_REQUESTED';
    end if;
  end loop;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, p_notes, 'other', null
  );

  foreach v_item_id in array p_inventory_item_ids
  loop
    insert into public.inventory_movements
      (inventory_item_id, movement_type, quantity, reason, recipient_person_id)
    values
      (v_item_id, 'reserved', 1, 'Public gear library request', v_person_id)
    returning id into v_movement_id;

    update public.inventory_items set status = 'reserved' where id = v_item_id;

    v_movement_ids := array_append(v_movement_ids, v_movement_id);
  end loop;

  return v_movement_ids;
end;
$$;

grant execute on function public.request_gear_items to anon, authenticated;
