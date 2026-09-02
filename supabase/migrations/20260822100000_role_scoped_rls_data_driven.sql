-- Replace every hardcoded has_role('admin') / has_role('event_coordinator') /
-- etc. check in RLS policies and secured RPCs with has_permission() against
-- the new resources/role_permissions matrix (issue #16). Table-by-table
-- mapping, verified against the policies this replaces
-- (20260821090000, 20260821100000, 20260821110000, 20260822070000,
-- 20260822080000):
--
--   events, event_sponsors, giveaways, giveaway_prizes, giveaway_winners,
--   event_logistics, event_volunteers: select -> events:view,
--   insert/update/delete -> events:manage. (admin/event_coordinator manage;
--   finance/volunteer view; board none — unchanged.)
--
--   event_expenses: select -> event_expenses:view, writes ->
--   event_expenses:manage. (admin/event_coordinator/finance manage;
--   board/volunteer none — unchanged.)
--
--   event_incidents: select -> event_incidents:view, writes ->
--   event_incidents:manage. (admin/event_coordinator only — unchanged.)
--
--   event_volunteer_hours: select -> event_volunteer_hours:view; insert ->
--   event_volunteer_hours:manage OR volunteer_hours_logging:manage (the
--   "log own hours" carve-out); update/delete -> event_volunteer_hours:manage
--   only, so a volunteer still can't edit/delete any entry — unchanged.
--
--   people: select -> people:view; insert -> people:manage OR
--   people_intake:manage (the inline-contact-creation carve-out used by
--   event/donation forms); update/delete -> people:manage only — unchanged.
--
--   donations: select -> finance:view; insert -> finance:manage OR
--   inventory_intake:manage (volunteer donation-intake carve-out); update ->
--   finance:manage; delete -> is_admin() (finance never had delete on
--   donations — kept admin-only rather than folding into finance:manage,
--   which would widen it) — unchanged.
--
--   inventory_items: select -> inventory:manage OR inventory_reports:view;
--   insert/update -> inventory:manage OR inventory_intake:manage (volunteer's
--   "edit distribution" carve-out); delete -> inventory:manage only —
--   unchanged.
--
--   inventory_movements: select -> inventory:manage OR inventory_reports:view;
--   insert -> inventory:manage OR inventory_intake:manage; update/delete ->
--   inventory:manage only — unchanged.

drop policy "events select" on public.events;
drop policy "events insert" on public.events;
drop policy "events update" on public.events;
drop policy "events delete" on public.events;

create policy "events select" on public.events for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "events insert" on public.events for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "events update" on public.events for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
create policy "events delete" on public.events for delete to authenticated
  using (public.has_permission('events', 'manage'));

drop policy "event_sponsors select" on public.event_sponsors;
drop policy "event_sponsors insert" on public.event_sponsors;
drop policy "event_sponsors update" on public.event_sponsors;
drop policy "event_sponsors delete" on public.event_sponsors;

create policy "event_sponsors select" on public.event_sponsors for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "event_sponsors insert" on public.event_sponsors for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "event_sponsors update" on public.event_sponsors for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
create policy "event_sponsors delete" on public.event_sponsors for delete to authenticated
  using (public.has_permission('events', 'manage'));

drop policy "giveaways select" on public.giveaways;
drop policy "giveaways insert" on public.giveaways;
drop policy "giveaways update" on public.giveaways;
drop policy "giveaways delete" on public.giveaways;

create policy "giveaways select" on public.giveaways for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "giveaways insert" on public.giveaways for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "giveaways update" on public.giveaways for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
create policy "giveaways delete" on public.giveaways for delete to authenticated
  using (public.has_permission('events', 'manage'));

drop policy "giveaway_prizes select" on public.giveaway_prizes;
drop policy "giveaway_prizes insert" on public.giveaway_prizes;
drop policy "giveaway_prizes update" on public.giveaway_prizes;
drop policy "giveaway_prizes delete" on public.giveaway_prizes;

create policy "giveaway_prizes select" on public.giveaway_prizes for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "giveaway_prizes insert" on public.giveaway_prizes for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "giveaway_prizes update" on public.giveaway_prizes for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
create policy "giveaway_prizes delete" on public.giveaway_prizes for delete to authenticated
  using (public.has_permission('events', 'manage'));

drop policy "giveaway_winners select" on public.giveaway_winners;
drop policy "giveaway_winners insert" on public.giveaway_winners;
drop policy "giveaway_winners update" on public.giveaway_winners;
drop policy "giveaway_winners delete" on public.giveaway_winners;

create policy "giveaway_winners select" on public.giveaway_winners for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "giveaway_winners insert" on public.giveaway_winners for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "giveaway_winners update" on public.giveaway_winners for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
create policy "giveaway_winners delete" on public.giveaway_winners for delete to authenticated
  using (public.has_permission('events', 'manage'));

drop policy "event_logistics select" on public.event_logistics;
drop policy "event_logistics insert" on public.event_logistics;
drop policy "event_logistics update" on public.event_logistics;
drop policy "event_logistics delete" on public.event_logistics;

create policy "event_logistics select" on public.event_logistics for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "event_logistics insert" on public.event_logistics for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "event_logistics update" on public.event_logistics for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
create policy "event_logistics delete" on public.event_logistics for delete to authenticated
  using (public.has_permission('events', 'manage'));

drop policy "event_volunteers select" on public.event_volunteers;
drop policy "event_volunteers insert" on public.event_volunteers;
drop policy "event_volunteers update" on public.event_volunteers;
drop policy "event_volunteers delete" on public.event_volunteers;

create policy "event_volunteers select" on public.event_volunteers for select to authenticated
  using (public.has_permission('events', 'view'));
create policy "event_volunteers insert" on public.event_volunteers for insert to authenticated
  with check (public.has_permission('events', 'manage'));
create policy "event_volunteers update" on public.event_volunteers for update to authenticated
  using (public.has_permission('events', 'manage')) with check (public.has_permission('events', 'manage'));
create policy "event_volunteers delete" on public.event_volunteers for delete to authenticated
  using (public.has_permission('events', 'manage'));

drop policy "event_expenses select" on public.event_expenses;
drop policy "event_expenses insert" on public.event_expenses;
drop policy "event_expenses update" on public.event_expenses;
drop policy "event_expenses delete" on public.event_expenses;

create policy "event_expenses select" on public.event_expenses for select to authenticated
  using (public.has_permission('event_expenses', 'view'));
create policy "event_expenses insert" on public.event_expenses for insert to authenticated
  with check (public.has_permission('event_expenses', 'manage'));
create policy "event_expenses update" on public.event_expenses for update to authenticated
  using (public.has_permission('event_expenses', 'manage')) with check (public.has_permission('event_expenses', 'manage'));
create policy "event_expenses delete" on public.event_expenses for delete to authenticated
  using (public.has_permission('event_expenses', 'manage'));

drop policy "event_incidents select" on public.event_incidents;
drop policy "event_incidents insert" on public.event_incidents;
drop policy "event_incidents update" on public.event_incidents;
drop policy "event_incidents delete" on public.event_incidents;

create policy "event_incidents select" on public.event_incidents for select to authenticated
  using (public.has_permission('event_incidents', 'view'));
create policy "event_incidents insert" on public.event_incidents for insert to authenticated
  with check (public.has_permission('event_incidents', 'manage'));
create policy "event_incidents update" on public.event_incidents for update to authenticated
  using (public.has_permission('event_incidents', 'manage')) with check (public.has_permission('event_incidents', 'manage'));
create policy "event_incidents delete" on public.event_incidents for delete to authenticated
  using (public.has_permission('event_incidents', 'manage'));

drop policy "event_volunteer_hours select" on public.event_volunteer_hours;
drop policy "event_volunteer_hours insert" on public.event_volunteer_hours;
drop policy "event_volunteer_hours update" on public.event_volunteer_hours;
drop policy "event_volunteer_hours delete" on public.event_volunteer_hours;

create policy "event_volunteer_hours select" on public.event_volunteer_hours for select to authenticated
  using (public.has_permission('event_volunteer_hours', 'view'));
create policy "event_volunteer_hours insert" on public.event_volunteer_hours for insert to authenticated
  with check (public.has_permission('event_volunteer_hours', 'manage') or public.has_permission('volunteer_hours_logging', 'manage'));
create policy "event_volunteer_hours update" on public.event_volunteer_hours for update to authenticated
  using (public.has_permission('event_volunteer_hours', 'manage')) with check (public.has_permission('event_volunteer_hours', 'manage'));
create policy "event_volunteer_hours delete" on public.event_volunteer_hours for delete to authenticated
  using (public.has_permission('event_volunteer_hours', 'manage'));

drop policy "people select" on public.people;
drop policy "people insert" on public.people;
drop policy "people update" on public.people;
drop policy "people delete" on public.people;

create policy "people select" on public.people for select to authenticated
  using (public.has_permission('people', 'view'));
create policy "people insert" on public.people for insert to authenticated
  with check (public.has_permission('people', 'manage') or public.has_permission('people_intake', 'manage'));
create policy "people update" on public.people for update to authenticated
  using (public.has_permission('people', 'manage')) with check (public.has_permission('people', 'manage'));
create policy "people delete" on public.people for delete to authenticated
  using (public.has_permission('people', 'manage'));

drop policy "donations select" on public.donations;
drop policy "donations insert" on public.donations;
drop policy "donations update" on public.donations;
drop policy "donations delete" on public.donations;

create policy "donations select" on public.donations for select to authenticated
  using (public.has_permission('finance', 'view'));
create policy "donations insert" on public.donations for insert to authenticated
  with check (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage'));
create policy "donations update" on public.donations for update to authenticated
  using (public.has_permission('finance', 'manage')) with check (public.has_permission('finance', 'manage'));
create policy "donations delete" on public.donations for delete to authenticated
  using (public.is_admin());

drop policy "inventory_items select" on public.inventory_items;
drop policy "inventory_items insert" on public.inventory_items;
drop policy "inventory_items update" on public.inventory_items;
drop policy "inventory_items delete" on public.inventory_items;

create policy "inventory_items select" on public.inventory_items for select to authenticated
  using (public.has_permission('inventory', 'manage') or public.has_permission('inventory_reports', 'view'));
create policy "inventory_items insert" on public.inventory_items for insert to authenticated
  with check (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage'));
create policy "inventory_items update" on public.inventory_items for update to authenticated
  using (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage'))
  with check (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage'));
create policy "inventory_items delete" on public.inventory_items for delete to authenticated
  using (public.has_permission('inventory', 'manage'));

drop policy "inventory_movements select" on public.inventory_movements;
drop policy "inventory_movements insert" on public.inventory_movements;
drop policy "inventory_movements update" on public.inventory_movements;
drop policy "inventory_movements delete" on public.inventory_movements;

create policy "inventory_movements select" on public.inventory_movements for select to authenticated
  using (public.has_permission('inventory', 'manage') or public.has_permission('inventory_reports', 'view'));
create policy "inventory_movements insert" on public.inventory_movements for insert to authenticated
  with check (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage'));
create policy "inventory_movements update" on public.inventory_movements for update to authenticated
  using (public.has_permission('inventory', 'manage')) with check (public.has_permission('inventory', 'manage'));
create policy "inventory_movements delete" on public.inventory_movements for delete to authenticated
  using (public.has_permission('inventory', 'manage'));

-- Secured RPCs: same has_permission()-based checks as the table policies
-- above, matching who could already call each one.

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
  if not (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage')) then
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

-- list_event_leads: the caller check and the candidate-lead pool both now
-- derive from who holds "manage" on the events resource, instead of
-- hardcoding role names in both places.
create or replace function public.list_event_leads()
returns table (
  user_id uuid,
  email text
)
language sql
security definer
set search_path = public
stable
as $$
  select distinct u.id, u.email
  from auth.users u
  join public.user_roles ur on ur.user_id = u.id
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.resources res on res.id = rp.resource_id and res.key = 'events' and rp.level = 'manage'
  where public.has_permission('events', 'manage')
  order by u.email;
$$;

grant execute on function public.list_event_leads() to authenticated;
