-- Generalizes record_event_distribution so a distribution can be recorded
-- without an event (for the standalone /inventory/distribution flow) and
-- can optionally record who received the items. inventory_movements.event_id
-- is already nullable (20260821020000); recipient_person_id is new.
-- Adding a required param before the existing optional ones changes the
-- signature, so the old overload must be dropped rather than replaced.

alter table public.inventory_movements
  add column recipient_person_id uuid references public.people(id);

drop function public.record_event_distribution(uuid, uuid, integer, text, timestamptz, boolean);

create function public.record_event_distribution(
  p_inventory_item_id uuid,
  p_quantity integer,
  p_reason text,
  p_event_id uuid default null,
  p_recipient_person_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_mark_item_distributed boolean default true
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movement_id uuid;
begin
  if not (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a distribution';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  insert into public.inventory_movements
    (inventory_item_id, movement_type, quantity, occurred_at, reason, event_id, recipient_person_id)
  values
    (p_inventory_item_id, 'distributed', p_quantity, coalesce(p_occurred_at, now()), p_reason, p_event_id, p_recipient_person_id)
  returning id into v_movement_id;

  if p_mark_item_distributed then
    update public.inventory_items set status = 'distributed' where id = p_inventory_item_id;
  end if;

  return v_movement_id;
end;
$$;

grant execute on function public.record_event_distribution to authenticated;
