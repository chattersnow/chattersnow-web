-- Not every in-kind donation is gear for the community gear library. Sponsor
-- contributions in particular are often vouchers, gift cards or lift tickets
-- destined for an event giveaway -- yet sync_event_sponsor_donations
-- (20260830180000) mirrors each one into an inventory_items row that lands on
-- the default status 'available', and public_gear_catalog (20260819020000)
-- publishes *everything* at status = 'available'. The result: sponsor
-- vouchers show up in the public gear library, where the community reads them
-- as gear they can take home, and request_gear_items (20260826370000) -- which
-- also gates on status alone -- will happily reserve one.
--
-- inventory_items had no way to say what an item is *for*; status only says
-- where it is in its lifecycle. intended_use adds that axis, and the two read
-- sites that face the public (the catalog view and the request RPC) plus the
-- staff distribution picker now require 'gear_library'. Everything else --
-- valuation reports, the items list, movement history -- deliberately keeps
-- counting every item regardless of destination, because a donated voucher is
-- still a donated asset the organization received and has to account for.
--
-- 'gear_library' is the default so ordinary donation intake is unchanged, and
-- so existing rows keep the behavior they have today.

alter table public.inventory_items
  add column intended_use text not null default 'gear_library'
    check (intended_use in ('gear_library', 'giveaway', 'internal'));

comment on column public.inventory_items.intended_use is
  'What the item is for: gear_library (public catalog + distributions), giveaway (event prizes), internal (organizational use). Only gear_library items are publicly visible or requestable.';

-- Backfill the rows this column exists for: anything mirrored from a sponsor
-- contribution, and anything already linked as a giveaway prize (a gear item
-- pulled onto a prize is, by that act, no longer gear-library stock).
update public.inventory_items ii
set intended_use = 'giveaway'
where exists (
    select 1 from public.event_sponsors es where es.inventory_item_id = ii.id
  )
  or exists (
    select 1 from public.giveaway_prizes gp where gp.source_inventory_item_id = ii.id
  );

-- Public catalog: same columns, so replace rather than drop (dependent grants
-- survive a replace).
create or replace view public.public_gear_catalog as
select
  id,
  description,
  size,
  type,
  gender,
  condition,
  photo_url,
  created_at
from public.inventory_items
where status = 'available'
  and intended_use = 'gear_library';

-- Public request path. The destination check rides along on the existing
-- lookup rather than raising a new error code: a non-gear-library item is
-- never listed in the catalog, so reaching here means a hand-crafted request,
-- and ITEM_NOT_FOUND is the honest answer -- that id is not in the gear
-- library. No client-side error mapping changes.
create or replace function public.request_gear_items(
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
      and intended_use = 'gear_library'
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

-- Donation intake carries a per-item destination. Absent or null falls back to
-- 'gear_library', so an older client that doesn't send the key still works.
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
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one item is required';
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

  insert into public.donations (donor_id, event_id)
  values (v_donor_id, p_event_id)
  returning id into v_donation_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.inventory_items
      (donation_id, description, size, type, gender, condition, face_value, notes, intended_use)
    values (
      v_donation_id,
      v_item->>'description',
      v_item->>'size',
      v_item->>'type',
      v_item->>'gender',
      v_item->>'condition',
      nullif(v_item->>'face_value', '')::numeric,
      v_item->>'notes',
      coalesce(nullif(v_item->>'intended_use', ''), 'gear_library')
    )
    returning id into v_item_id;

    v_item_ids := array_append(v_item_ids, v_item_id);

    insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason)
    values (v_item_id, 'received', 1, 'Donation intake');
  end loop;

  return query select v_donation_id, v_item_ids;
end;
$$;

-- Sponsor mirror: new in-kind rows default to 'giveaway', which is what a
-- sponsor contribution nearly always is. Only the insert branch sets it -- the
-- update branch leaves intended_use alone so that a staffer who reclassifies a
-- sponsor's item as gear-library stock isn't overwritten by the next edit to
-- the sponsor record.
create or replace function public.sync_event_sponsor_donations(p_sponsor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_person_id uuid;
  v_support_type text;
  v_in_kind_description text;
  v_contribution_value numeric;
  v_notes text;
  v_donation_id uuid;
  v_inventory_item_id uuid;
  v_monetary_donation_id uuid;
  v_wants_cash boolean;
  v_wants_in_kind boolean;
  v_new_id uuid;
begin
  select event_id, person_id, support_type, in_kind_description, contribution_value,
         notes, donation_id, inventory_item_id, monetary_donation_id
  into v_event_id, v_person_id, v_support_type, v_in_kind_description, v_contribution_value,
       v_notes, v_donation_id, v_inventory_item_id, v_monetary_donation_id
  from public.event_sponsors
  where id = p_sponsor_id;

  if not found then
    return;
  end if;

  v_wants_cash := v_support_type = 'cash' and v_contribution_value is not null and v_contribution_value > 0;
  v_wants_in_kind := v_support_type = 'in_kind'
    and (v_in_kind_description is not null or v_contribution_value is not null);

  if v_wants_cash then
    if v_monetary_donation_id is null then
      insert into public.monetary_donations (donor_id, event_id, amount, method, notes)
      values (v_person_id, v_event_id, v_contribution_value, 'other', v_notes)
      returning id into v_new_id;

      update public.event_sponsors set monetary_donation_id = v_new_id where id = p_sponsor_id;
    else
      update public.monetary_donations
      set amount = v_contribution_value, notes = v_notes
      where id = v_monetary_donation_id;
    end if;
  elsif v_monetary_donation_id is not null then
    delete from public.monetary_donations where id = v_monetary_donation_id;
    update public.event_sponsors set monetary_donation_id = null where id = p_sponsor_id;
  end if;

  if v_wants_in_kind then
    if v_donation_id is null then
      insert into public.donations (donor_id, event_id, notes)
      values (v_person_id, v_event_id, v_notes)
      returning id into v_new_id;

      v_donation_id := v_new_id;

      insert into public.inventory_items (donation_id, description, type, condition, face_value, intended_use)
      values (
        v_donation_id,
        coalesce(v_in_kind_description, 'Sponsor in-kind contribution'),
        'other',
        'new',
        v_contribution_value,
        'giveaway'
      )
      returning id into v_new_id;

      insert into public.inventory_movements (inventory_item_id, movement_type, quantity, reason, event_id)
      values (v_new_id, 'received', 1, 'Sponsor contribution', v_event_id);

      update public.event_sponsors
      set donation_id = v_donation_id, inventory_item_id = v_new_id
      where id = p_sponsor_id;
    else
      update public.inventory_items
      set description = coalesce(v_in_kind_description, 'Sponsor in-kind contribution'),
          face_value = v_contribution_value
      where id = v_inventory_item_id;

      update public.donations set notes = v_notes where id = v_donation_id;
    end if;
  elsif v_donation_id is not null then
    delete from public.inventory_movements where inventory_item_id = v_inventory_item_id;
    delete from public.inventory_items where id = v_inventory_item_id;
    delete from public.donations where id = v_donation_id;
    update public.event_sponsors
    set donation_id = null, inventory_item_id = null
    where id = p_sponsor_id;
  end if;
end;
$$;
