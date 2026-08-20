-- Optionally link donations (gear collected) and inventory movements (gear
-- distributed) to the event they happened at.

alter table public.donations
  add column event_id uuid references public.events(id) on delete set null;

alter table public.inventory_movements
  add column event_id uuid references public.events(id) on delete set null;

-- Appending a parameter changes the function's arg-count signature, so this
-- must be dropped (not create-or-replace'd) to avoid leaving the old 7-arg
-- overload in place alongside a new 8-arg one.
drop function if exists public.create_donation_with_items(
  text, boolean, text, text, text, text, jsonb
);

create function public.create_donation_with_items(
  p_donor_name text,
  p_donor_is_anonymous boolean,
  p_donor_source_type text,
  p_donor_email text,
  p_donor_phone text,
  p_donor_notes text,
  p_items jsonb,
  p_event_id uuid default null
) returns table(donation_id uuid, inventory_item_ids uuid[])
language plpgsql
security invoker
as $$
declare
  v_donor_id uuid;
  v_donation_id uuid;
  v_item_id uuid;
  v_item jsonb;
  v_item_ids uuid[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one item is required';
  end if;

  insert into public.donors (name, is_anonymous, source_type, email, phone, notes)
  values (p_donor_name, p_donor_is_anonymous, p_donor_source_type, p_donor_email, p_donor_phone, p_donor_notes)
  returning id into v_donor_id;

  insert into public.donations (donor_id, event_id)
  values (v_donor_id, p_event_id)
  returning id into v_donation_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.inventory_items
      (donation_id, description, size, type, gender, condition, face_value, notes)
    values (
      v_donation_id,
      v_item->>'description',
      v_item->>'size',
      v_item->>'type',
      v_item->>'gender',
      v_item->>'condition',
      nullif(v_item->>'face_value', '')::numeric,
      v_item->>'notes'
    )
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);

    insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason)
    values (v_item_id, 'received', 1, 'Donation intake');
  end loop;

  return query select v_donation_id, v_item_ids;
end;
$$;

grant execute on function public.create_donation_with_items to authenticated;

-- No existing write path creates inventory_movements outside donation intake.
-- Minimal atomic RPC for recording a distribution, optionally tied to an event.
create function public.record_event_distribution(
  p_inventory_item_id uuid,
  p_event_id uuid,
  p_quantity integer,
  p_reason text,
  p_occurred_at timestamptz default now(),
  p_mark_item_distributed boolean default true
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  insert into public.inventory_movements
    (inventory_item_id, movement_type, quantity, occurred_at, reason, event_id)
  values
    (p_inventory_item_id, 'distributed', p_quantity, coalesce(p_occurred_at, now()), p_reason, p_event_id)
  returning id into v_movement_id;

  if p_mark_item_distributed then
    update public.inventory_items set status = 'distributed' where id = p_inventory_item_id;
  end if;

  return v_movement_id;
end;
$$;

grant execute on function public.record_event_distribution to authenticated;
