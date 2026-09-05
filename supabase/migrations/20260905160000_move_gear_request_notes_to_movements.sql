-- Issue #721: a public gear request's free-text notes were written onto
-- people.notes, not onto the movement the request creates.
--
-- request_gear_item(s) passed p_notes straight into
-- resolve_or_create_person_by_email(), which stores it on the person row.
-- That is wrong twice over:
--
--   * people.notes is a directory field about a person, maintained by staff in
--     People. A sentence about one gear request in 2026 is not that, and
--     because the helper resolves by email, a returning requester's text lands
--     on a record staff may already be keeping.
--   * Retention (#602) publishes gear requests for 3 years from handover and
--     enforces that by unlinking the movement from the requester. A person
--     retained for another reason -- a donor, a board member, a volunteer with
--     logged hours -- keeps their people.notes forever, so the request text
--     outlives its own clock.
--
-- A new inventory_movements.notes column rather than appending to
-- inventory_movements.reason: reason carries the fixed string
-- 'Public gear library request' that seed data and future queries match on,
-- and staff-facing distribution editing already treats it as a short label.
alter table public.inventory_movements add column notes text;

comment on column public.inventory_movements.notes is
  'Free text supplied with this movement -- e.g. what a public gear requester wrote on the request form. Per-request context, unlike reason, which is a short fixed label. Cleared by the gear_requests retention rule.';

-- Public request path, single item. Body from 20260826090000; the only change
-- is where p_notes goes. Signature unchanged, so create-or-replace is safe and
-- no caller has to move.
create or replace function public.request_gear_item(
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
  v_notes text := nullif(btrim(p_notes), '');
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
    p_name, p_email, p_phone, null, 'other', null
  );

  insert into public.inventory_movements
    (inventory_item_id, movement_type, quantity, reason, recipient_person_id, notes)
  values
    (p_inventory_item_id, 'reserved', 1, 'Public gear library request', v_person_id, v_notes)
  returning id into v_movement_id;

  update public.inventory_items set status = 'reserved' where id = p_inventory_item_id;

  return v_movement_id;
end;
$$;

-- Public request path, cart. Body from 20260904000000; same one change. Every
-- movement in a multi-item request gets the same text, because the visitor
-- wrote it once about the request as a whole.
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
  v_notes text := nullif(btrim(p_notes), '');
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
    p_name, p_email, p_phone, null, 'other', null
  );

  foreach v_item_id in array p_inventory_item_ids
  loop
    insert into public.inventory_movements
      (inventory_item_id, movement_type, quantity, reason, recipient_person_id, notes)
    values
      (v_item_id, 'reserved', 1, 'Public gear library request', v_person_id, v_notes)
    returning id into v_movement_id;

    update public.inventory_items set status = 'reserved' where id = v_item_id;

    v_movement_ids := array_append(v_movement_ids, v_movement_id);
  end loop;

  return v_movement_ids;
end;
$$;

-- Existing values that came in through this path. There is no marker saying
-- which people.notes a gear request wrote, so this moves only the rows where
-- the request path is the only thing that could have written them:
--
--   * created_by is null -- the row was inserted by an unauthenticated caller.
--     Donation intake, the other caller that passes real p_notes, requires a
--     permission and therefore always stamps auth.uid().
--   * source_type = 'other' -- what the gear RPCs pass.
--   * the person is the recipient of a 'Public gear library request' movement.
--
-- The text is relocated, never dropped: it lands on the person's *earliest*
-- gear-request movement, which is the request that created the person row and
-- so the request the text was written about. The residual risk is a note a
-- staff member later typed onto such a person in People; it moves to the
-- movement, where it is still read (see the Requested by block in the item
-- modal) but no longer a directory field. Deliberate -- leaving them behind is
-- the retention hole this migration exists to close.
with source as (
  select p.id as person_id,
         btrim(p.notes) as notes,
         (select m.id
            from public.inventory_movements m
           where m.recipient_person_id = p.id
             and m.movement_type = 'reserved'
             and m.reason = 'Public gear library request'
           order by m.occurred_at asc, m.id asc
           limit 1) as movement_id
    from public.people p
   where p.created_by is null
     and p.source_type = 'other'
     and nullif(btrim(p.notes), '') is not null
)
update public.inventory_movements m
   set notes = s.notes
  from source s
 where m.id = s.movement_id;

update public.people p
   set notes = null
 where p.created_by is null
   and p.source_type = 'other'
   and nullif(btrim(p.notes), '') is not null
   and exists (
     select 1
       from public.inventory_movements m
      where m.recipient_person_id = p.id
        and m.movement_type = 'reserved'
        and m.reason = 'Public gear library request'
   );
