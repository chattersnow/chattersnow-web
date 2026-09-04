-- Ticket-granting RPCs for the giveaway tier system (issue #5).
--
-- Two entry paths write into the same giveaway_ticket_grants pool:
--   * donation intake, folded into the existing create_donation_with_items so
--     the staffer is told how many tickets to hand over as part of completing
--     the donation, not in a separate step;
--   * ticket sales, via a new record_giveaway_ticket_sale.
--
-- Both expand the same giveaway_tier_grants matrix, so the tier table is
-- edited in exactly one place.

-- Suggests a tier for a donated item from the giveaway's keyword hints.
-- Returns null when nothing matches, which the caller surfaces as "pick a tier"
-- rather than silently granting no tickets. Longest match wins so that a rule
-- for 'helmet cover' beats a rule for 'helmet' regardless of insertion order.
--
-- Deliberately security invoker: a direct caller only ever sees rules their own
-- RLS already allows, and the security-definer callers below run as the table
-- owner, so donation intake still resolves tiers for a volunteer who has
-- inventory_intake but no events:view.
create or replace function public.suggest_giveaway_tier(
  p_giveaway_id uuid,
  p_item_type text
) returns uuid
language sql
stable
set search_path = public
as $$
  select r.tier_id
  from public.giveaway_tier_rules r
  where r.giveaway_id = p_giveaway_id
    and p_item_type is not null
    and position(lower(btrim(r.match_text)) in lower(p_item_type)) > 0
  order by length(r.match_text) desc
  limit 1;
$$;

revoke all on function public.suggest_giveaway_tier(uuid, text) from public;
grant execute on function public.suggest_giveaway_tier(uuid, text) to authenticated;

-- Expands the matrix for one source tier into grant rows. Shared by both entry
-- paths so the two can never drift. p_multiplier covers a package that grants
-- more than one bundle; donation intake always passes 1.
--
-- Internal helper only. It is security definer (donation intake runs for
-- volunteers who cannot write giveaway tables themselves) and performs no
-- permission check of its own, so execute is NOT granted to authenticated --
-- otherwise any signed-in user could call it through PostgREST and mint
-- themselves tickets. Its two callers below do the authorization.
create or replace function public.grant_giveaway_tickets(
  p_giveaway_id uuid,
  p_source_tier_id uuid,
  p_multiplier integer,
  p_donation_id uuid,
  p_inventory_item_id uuid,
  p_sale_id uuid
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.giveaway_ticket_grants (
    giveaway_id, ticket_tier_id, source_tier_id, quantity,
    donation_id, inventory_item_id, sale_id
  )
  select
    p_giveaway_id, g.ticket_tier_id, p_source_tier_id, g.quantity * p_multiplier,
    p_donation_id, p_inventory_item_id, p_sale_id
  from public.giveaway_tier_grants g
  where g.giveaway_id = p_giveaway_id
    and g.source_tier_id = p_source_tier_id
    -- A zero cell (bronze earns no gold tickets) is a real part of the matrix
    -- but not a ticket anyone hands over, so it never becomes a grant row.
    and g.quantity > 0;
$$;

revoke all on function public.grant_giveaway_tickets(uuid, uuid, integer, uuid, uuid, uuid) from public;
revoke all on function public.grant_giveaway_tickets(uuid, uuid, integer, uuid, uuid, uuid) from authenticated, anon;

-- Per-colour totals for a giveaway, or for one donation/sale. This is the
-- "how many tickets do I hand over" answer, and with p_donation_id and
-- p_sale_id null it is also the odds denominator the official-rules work
-- (issue #666) will need.
create or replace function public.giveaway_ticket_totals(
  p_giveaway_id uuid,
  p_donation_id uuid default null,
  p_sale_id uuid default null
) returns table(tier_id uuid, tier_key text, tier_label text, tier_rank integer, quantity bigint)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.key, t.label, t.rank, coalesce(sum(g.quantity), 0)::bigint
  from public.giveaway_tiers t
  left join public.giveaway_ticket_grants g
    on g.ticket_tier_id = t.id
   and (p_donation_id is null or g.donation_id = p_donation_id)
   and (p_sale_id is null or g.sale_id = p_sale_id)
  where t.giveaway_id = p_giveaway_id
    and public.has_permission('events', 'view')
  group by t.id, t.key, t.label, t.rank
  order by t.rank;
$$;

revoke all on function public.giveaway_ticket_totals(uuid, uuid, uuid) from public;
grant execute on function public.giveaway_ticket_totals(uuid, uuid, uuid) to authenticated;

-- Records a ticket sale and hands back the tickets to give out. Payment is
-- taken outside the system (cash, card reader) -- this only records that it
-- happened. unit_price is copied from the package at sale time so repricing
-- later cannot rewrite history.
create or replace function public.record_giveaway_ticket_sale(
  p_giveaway_id uuid,
  p_package_id uuid,
  p_quantity integer,
  p_purchaser_person_id uuid default null,
  p_sold_at timestamptz default null,
  p_notes text default null
) returns table(sale_id uuid, amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price numeric(10, 2);
  v_tier_id uuid;
  v_bundle integer;
  v_is_active boolean;
  v_sale_id uuid;
  v_amount numeric(10, 2);
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to record a ticket sale';
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;

  select price, tier_id, bundle_quantity, is_active
  into v_price, v_tier_id, v_bundle, v_is_active
  from public.giveaway_ticket_packages
  where id = p_package_id and giveaway_id = p_giveaway_id;

  if not found then
    raise exception 'Ticket package does not belong to this giveaway';
  end if;

  if not v_is_active then
    raise exception 'Ticket package is no longer on sale';
  end if;

  v_amount := v_price * p_quantity;

  insert into public.giveaway_ticket_sales (
    giveaway_id, package_id, purchaser_person_id, quantity, unit_price, amount, sold_at, notes
  )
  values (
    p_giveaway_id, p_package_id, p_purchaser_person_id, p_quantity, v_price, v_amount,
    coalesce(p_sold_at, now()), p_notes
  )
  returning id into v_sale_id;

  perform public.grant_giveaway_tickets(
    p_giveaway_id, v_tier_id, v_bundle * p_quantity, null, null, v_sale_id
  );

  return query select v_sale_id, v_amount;
end;
$$;

revoke all on function public.record_giveaway_ticket_sale(uuid, uuid, integer, uuid, timestamptz, text) from public;
grant execute on function public.record_giveaway_ticket_sale(uuid, uuid, integer, uuid, timestamptz, text) to authenticated;

-- Donation intake now also issues giveaway tickets. Redefined rather than
-- altered because the file this comes from is forward-only and already
-- redefines this function once (20260904000000).
--
-- Behaviour added: when the donation is tied to an event whose giveaway has
-- tiers configured, each item resolves to a tier -- the caller's explicit
-- 'giveaway_tier' key if present, otherwise the keyword hints -- and expands
-- the matrix into grant rows. An item that resolves to no tier is returned in
-- untiered_item_ids so the UI can ask the staffer to pick one instead of
-- silently granting nothing. Everything else is unchanged, and a donation with
-- no event, or an event with no configured giveaway, behaves exactly as before.
--
-- The return signature gains two columns, so the old function has to be dropped
-- rather than replaced -- Postgres won't let `create or replace` change a
-- return type.
drop function if exists public.create_donation_with_items(
  text, boolean, text, text, text, text, jsonb, uuid
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
) returns table(
  donation_id uuid,
  inventory_item_ids uuid[],
  giveaway_id uuid,
  untiered_item_ids uuid[]
)
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
  v_giveaway_id uuid;
  v_tier_id uuid;
  v_tier_key text;
  v_untiered uuid[] := '{}';
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

  -- Only a giveaway that has actually been set up with tiers grants tickets.
  -- A legacy flat giveaway (no tier rows) is left alone.
  if p_event_id is not null then
    select g.id into v_giveaway_id
    from public.giveaways g
    where g.event_id = p_event_id
      and exists (select 1 from public.giveaway_tiers t where t.giveaway_id = g.id);
  end if;

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

    if v_giveaway_id is not null then
      v_tier_id := null;
      v_tier_key := nullif(v_item->>'giveaway_tier', '');

      if v_tier_key is not null then
        select t.id into v_tier_id
        from public.giveaway_tiers t
        where t.giveaway_id = v_giveaway_id and t.key = v_tier_key;
      end if;

      if v_tier_id is null then
        v_tier_id := public.suggest_giveaway_tier(v_giveaway_id, v_item->>'type');
      end if;

      if v_tier_id is null then
        v_untiered := array_append(v_untiered, v_item_id);
      else
        -- Every donated item grants its own bundle, uncapped (issue #5).
        perform public.grant_giveaway_tickets(
          v_giveaway_id, v_tier_id, 1, v_donation_id, v_item_id, null
        );
      end if;
    end if;
  end loop;

  return query select v_donation_id, v_item_ids, v_giveaway_id, v_untiered;
end;
$$;
