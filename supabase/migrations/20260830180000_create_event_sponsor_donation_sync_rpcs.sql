-- Issue #520: fold event_sponsors contributions into the shared donation
-- model instead of leaving them in a silo no other page reads. These RPCs
-- replace the raw insert/update/delete calls sponsors-actions.ts used to
-- make directly against event_sponsors, following the same shape as the
-- existing multi-table write RPCs (e.g. create_donation_with_items in
-- 20260824170000_dedupe_donation_intake_people.sql): security definer with
-- an explicit has_permission check inside, since event_coordinator (who
-- holds events:manage) does not hold finance:manage/inventory:manage, which
-- is what direct inserts into monetary_donations/donations/inventory_items
-- would otherwise require under their own RLS.
--
-- support_type = 'cash' mirrors into monetary_donations; support_type =
-- 'in_kind' mirrors into donations + one inventory_items row. 'both' and
-- 'other' are intentionally left unmirrored: the sponsor form has a single
-- contribution_value field, so for 'both' there is no reliable way to split
-- it into a cash amount and an in-kind face value without fabricating a
-- number -- mirroring the same value into both places would double-count
-- the actual contribution in Finance and Inventory totals. The sponsor row
-- itself keeps showing support_type/contribution_value/in_kind_description
-- as before regardless of whether a linked record exists.

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

  -- Cash side: monetary_donations
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

  -- In-kind side: donations + one inventory_items row
  if v_wants_in_kind then
    if v_donation_id is null then
      insert into public.donations (donor_id, event_id, notes)
      values (v_person_id, v_event_id, v_notes)
      returning id into v_new_id;

      v_donation_id := v_new_id;

      insert into public.inventory_items (donation_id, description, type, condition, face_value)
      values (
        v_donation_id,
        coalesce(v_in_kind_description, 'Sponsor in-kind contribution'),
        'other',
        'new',
        v_contribution_value
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

create or replace function public.create_event_sponsor(
  p_event_id uuid,
  p_person_id uuid,
  p_support_type text,
  p_in_kind_description text,
  p_contribution_value numeric,
  p_is_public boolean,
  p_notes text,
  p_follow_up_status text,
  p_follow_up_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor_id uuid;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  insert into public.event_sponsors (
    event_id, person_id, support_type, in_kind_description, contribution_value,
    is_public, notes, follow_up_status, follow_up_notes
  )
  values (
    p_event_id, p_person_id, p_support_type, p_in_kind_description, p_contribution_value,
    p_is_public, p_notes, p_follow_up_status, p_follow_up_notes
  )
  returning id into v_sponsor_id;

  perform public.sync_event_sponsor_donations(v_sponsor_id);

  return v_sponsor_id;
end;
$$;

create or replace function public.update_event_sponsor(
  p_id uuid,
  p_support_type text,
  p_in_kind_description text,
  p_contribution_value numeric,
  p_is_public boolean,
  p_notes text,
  p_follow_up_status text,
  p_follow_up_notes text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  update public.event_sponsors
  set support_type = p_support_type,
      in_kind_description = p_in_kind_description,
      contribution_value = p_contribution_value,
      is_public = p_is_public,
      notes = p_notes,
      follow_up_status = p_follow_up_status,
      follow_up_notes = p_follow_up_notes
  where id = p_id;

  perform public.sync_event_sponsor_donations(p_id);
end;
$$;

create or replace function public.delete_event_sponsor(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donation_id uuid;
  v_inventory_item_id uuid;
  v_monetary_donation_id uuid;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  select donation_id, inventory_item_id, monetary_donation_id
  into v_donation_id, v_inventory_item_id, v_monetary_donation_id
  from public.event_sponsors
  where id = p_id;

  if v_inventory_item_id is not null then
    delete from public.inventory_movements where inventory_item_id = v_inventory_item_id;
    delete from public.inventory_items where id = v_inventory_item_id;
  end if;

  if v_donation_id is not null then
    delete from public.donations where id = v_donation_id;
  end if;

  if v_monetary_donation_id is not null then
    delete from public.monetary_donations where id = v_monetary_donation_id;
  end if;

  delete from public.event_sponsors where id = p_id;
end;
$$;

grant execute on function public.create_event_sponsor(
  uuid, uuid, text, text, numeric, boolean, text, text, text
) to authenticated;
grant execute on function public.update_event_sponsor(
  uuid, text, text, numeric, boolean, text, text, text
) to authenticated;
grant execute on function public.delete_event_sponsor(uuid) to authenticated;
