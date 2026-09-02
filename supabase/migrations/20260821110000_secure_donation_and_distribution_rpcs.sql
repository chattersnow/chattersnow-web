-- create_donation_with_items and record_event_distribution insert into
-- people/donations/inventory_items/inventory_movements and read the new
-- row back via `returning ... into`. Postgres RLS requires the calling
-- role to also satisfy the table's SELECT policy for `returning` to
-- succeed, not just the INSERT/UPDATE policy's WITH CHECK. Since the
-- volunteer role's grant on these tables (20260821100000) is
-- insert/update-only by design (no SELECT — see People directory and
-- Inventory reports being off-limits to volunteer in the entitlement
-- matrix), calling these as `security invoker` would raise a spurious RLS
-- violation for volunteers. Switch both to `security definer` (bypassing
-- RLS on the internal reads/writes, same as this migration's has_role/
-- is_admin/my_roles helpers) and gate them with an explicit role check
-- instead, matching who the entitlement matrix actually authorizes for
-- each workflow.

create or replace function public.create_donation_with_items(
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
security definer
set search_path = public
as $$
declare
  v_donor_id uuid;
  v_donation_id uuid;
  v_item_id uuid;
  v_item jsonb;
  v_item_ids uuid[] := '{}';
begin
  if not (public.has_role('admin') or public.has_role('finance') or public.has_role('volunteer')) then
    raise exception 'Not authorized to record a donation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one item is required';
  end if;

  insert into public.people (name, is_anonymous, source_type, email, phone, notes, is_donor)
  values (p_donor_name, p_donor_is_anonymous, p_donor_source_type, p_donor_email, p_donor_phone, p_donor_notes, true)
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

create or replace function public.record_event_distribution(
  p_inventory_item_id uuid,
  p_event_id uuid,
  p_quantity integer,
  p_reason text,
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
  if not (public.has_role('admin') or public.has_role('volunteer')) then
    raise exception 'Not authorized to record a distribution';
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
