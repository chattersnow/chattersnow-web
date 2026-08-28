-- Replace single-item donation intake with multi-item intake.
-- No table/RLS/grant changes: donations already support multiple inventory_items
-- via inventory_items.donation_id. This migration only replaces the intake RPC.

drop function if exists public.create_donation_with_item(
  text, boolean, text, text, text, text,
  text, text, text, text, text, numeric, text
);

create function public.create_donation_with_items(
  p_donor_name text,
  p_donor_is_anonymous boolean,
  p_donor_source_type text,
  p_donor_email text,
  p_donor_phone text,
  p_donor_notes text,
  p_items jsonb
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

  insert into public.donations (donor_id)
  values (v_donor_id)
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
