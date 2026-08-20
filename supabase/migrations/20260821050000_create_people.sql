-- Rename the donor-only table into a shared "people" directory covering
-- donors, sponsors, and volunteers, so the same contact record (name/email/
-- phone/notes) can be reused across all three instead of being duplicated
-- per context. This is a metadata-only rename: existing donor rows, indexes,
-- policies, and the donations.donor_id foreign key all survive untouched.
alter table public.donors rename to people;

alter table public.people
  add column is_donor boolean not null default false,
  add column is_sponsor boolean not null default false,
  add column is_volunteer boolean not null default false;

-- Every row that already exists came from the donation-intake flow.
update public.people set is_donor = true;

-- Point the donation-intake RPC at the renamed table and tag inserted rows
-- as donors. Signature is unchanged from the 8-arg version created in
-- 20260821020000_link_donations_and_movements_to_events.sql, so this is a
-- safe create-or-replace rather than a drop+create.
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
