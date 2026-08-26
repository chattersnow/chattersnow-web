-- inventory_movements.created_by was `not null default auth.uid()`, which
-- is fine for every existing (staff-authenticated) insert path but breaks
-- here: request_gear_item is callable by anon, and auth.uid() resolves to
-- null for a true anonymous request. Same fix already made for
-- people.created_by in 20260824150000_resolve_or_create_person_by_email.sql.
alter table public.inventory_movements alter column created_by drop not null;

-- Public, unauthenticated RPC backing the "request this item" flow on the
-- gear library detail page (issue #170). Anon has no direct write access to
-- inventory_items/inventory_movements/people, so this security-definer
-- function does the guarded work itself: lock the item, verify it's still
-- available, resolve the requester into people (via the existing
-- resolve_or_create_person_by_email helper, same as register_for_event),
-- record a 'reserved' movement, and flip the item to 'reserved' so it drops
-- out of public_gear_catalog.
create function public.request_gear_item(
  p_inventory_item_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_person_id uuid;
  v_movement_id uuid;
begin
  select status into v_status
  from public.inventory_items
  where id = p_inventory_item_id
  for update;

  if not found then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  if v_status <> 'available' then
    raise exception 'ITEM_ALREADY_REQUESTED';
  end if;

  v_person_id := public.resolve_or_create_person_by_email(
    p_name, p_email, p_phone, p_notes, 'other', null
  );

  insert into public.inventory_movements
    (inventory_item_id, movement_type, quantity, reason, recipient_person_id)
  values
    (p_inventory_item_id, 'reserved', 1, 'Public gear library request', v_person_id)
  returning id into v_movement_id;

  update public.inventory_items set status = 'reserved' where id = p_inventory_item_id;

  return v_movement_id;
end;
$$;

grant execute on function public.request_gear_item to anon, authenticated;
