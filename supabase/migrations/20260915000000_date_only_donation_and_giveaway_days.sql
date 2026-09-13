-- #1053: three calendar days were living in `timestamptz` columns.
--
-- `donations.donated_at`, `giveaways.drawing_date` and
-- `giveaway_winners.distributed_at` are all filled from an `<input type="date">`
-- and all read back through a browser-zone formatter. The form parsed the typed
-- day with `new Date("2027-05-15")`, which JavaScript reads as *UTC midnight*,
-- so every viewer west of Greenwich was shown the previous day. Nobody records
-- the time of day a prize was handed over; these are days, and they belong in
-- `date` columns, where the value means the same thing to every reader.
--
-- `monetary_donations.received_date` (20260829100000) has been `date not null
-- default current_date` since it was written. This brings the other three into
-- line with it.
--
-- Two function signatures move with the columns, so both are dropped and
-- recreated rather than replaced -- a changed or added parameter leaves a
-- second overload behind, and PostgREST cannot tell two overloads apart.

set local timezone to 'UTC';

-- ---------------------------------------------------------------------------
-- Backfill: which day did each stored instant mean?
-- ---------------------------------------------------------------------------
--
-- The existing rows are two populations and a single cast is wrong for one of
-- them:
--
--   * A day someone typed arrives as *exactly* UTC midnight, because that is
--     what `new Date("YYYY-MM-DD").toISOString()` produces. Read in UTC it
--     gives back the day that was typed.
--   * A real instant -- `donations.donated_at` defaulted to `now()` at intake,
--     and the demo/seed rows -- means the day it was in *the organization's*
--     zone. Read in UTC, an intake at 7pm on 28 February in Denver becomes
--     1 March.
--
-- So the instants that are exactly UTC midnight are left alone and everything
-- else is first moved onto the UTC midnight of its own tenant-local day, after
-- which one cast is correct for every row.
--
-- The platform has no tenant timezone column (#1065 proposes one for the
-- finance rollup's day buckets, which has the same root). Until it does, a
-- tenant's zone is taken to be the one most of its events are in, which is the
-- only statement about a tenant's local time the database currently holds.
-- Tenants with no events fall back to UTC, which changes nothing for them.

create temp table tenant_day_zone as
select t.id as tenant_id,
       coalesce(
         (select mode() within group (order by e.timezone)
          from public.events e
          where e.tenant_id = t.id),
         'UTC'
       ) as zone
from public.tenants t;

update public.donations d
set donated_at = (
      (d.donated_at at time zone z.zone)::date
    )::timestamp at time zone 'UTC'
from tenant_day_zone z
where z.tenant_id = d.tenant_id
  and d.donated_at <> date_trunc('day', d.donated_at);

update public.giveaways g
set drawing_date = (
      (g.drawing_date at time zone z.zone)::date
    )::timestamp at time zone 'UTC'
from tenant_day_zone z
where z.tenant_id = g.tenant_id
  and g.drawing_date is not null
  and g.drawing_date <> date_trunc('day', g.drawing_date);

update public.giveaway_winners w
set distributed_at = (
      (w.distributed_at at time zone z.zone)::date
    )::timestamp at time zone 'UTC'
from tenant_day_zone z
where z.tenant_id = w.tenant_id
  and w.distributed_at is not null
  and w.distributed_at <> date_trunc('day', w.distributed_at);

drop table tenant_day_zone;

-- ---------------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------------
--
-- The default is dropped before the type change and set again after it:
-- Postgres will not cast an existing `now()` default to the new type on its
-- own. `current_date` is the database's day rather than the caller's, which is
-- why `create_donation_with_items` below takes the day as an argument and
-- leaves this as the fallback for a direct SQL insert.

alter table public.donations
  alter column donated_at drop default;

alter table public.donations
  alter column donated_at type date using (donated_at at time zone 'UTC')::date;

alter table public.donations
  alter column donated_at set default current_date;

alter table public.giveaways
  alter column drawing_date type date using (drawing_date at time zone 'UTC')::date;

alter table public.giveaway_winners
  alter column distributed_at type date using (distributed_at at time zone 'UTC')::date;

-- ---------------------------------------------------------------------------
-- upsert_giveaway_winner: p_distributed_at becomes a day (20260914000000)
-- ---------------------------------------------------------------------------
--
-- Unchanged from 20260914000000 apart from that parameter's type and the one
-- expression that used it as an instant.
--
-- The inventory movement this records still needs a `timestamptz`, and all the
-- caller supplies now is a day. It is stamped at midday UTC rather than
-- midnight: midnight UTC renders as the previous day everywhere west of
-- Greenwich, which is the very bug this migration exists to remove, while
-- midday reads as the intended day in every zone from UTC-11 to UTC+11.

drop function if exists public.upsert_giveaway_winner(uuid, text, text, text, timestamptz, text);

create function public.upsert_giveaway_winner(
  p_prize_id uuid,
  p_winner_name text,
  p_winner_contact text default null,
  p_distribution_status text default 'pending',
  p_distributed_at date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_event_id uuid;
  v_item_id uuid;
  v_item_status text;
  v_winner_id uuid;
  v_winner_person_id uuid;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage this giveaway';
  end if;

  select g.event_id, gp.source_inventory_item_id
  into v_event_id, v_item_id
  from public.giveaway_prizes gp
  join public.giveaways g on g.id = gp.giveaway_id
  where gp.id = p_prize_id
    and gp.tenant_id = v_tenant_id;

  if not found then
    raise exception 'PRIZE_NOT_FOUND';
  end if;

  insert into public.giveaway_winners
    (tenant_id, giveaway_prize_id, winner_name, winner_contact,
     distribution_status, distributed_at, notes)
  values
    (v_tenant_id, p_prize_id, p_winner_name, p_winner_contact,
     coalesce(p_distribution_status, 'pending'), p_distributed_at, p_notes)
  on conflict (giveaway_prize_id) do update
  set winner_name = excluded.winner_name,
      winner_contact = excluded.winner_contact,
      distribution_status = excluded.distribution_status,
      distributed_at = excluded.distributed_at,
      notes = excluded.notes
  returning id, winner_person_id into v_winner_id, v_winner_person_id;

  if v_item_id is null then
    return v_winner_id;
  end if;

  select status into v_item_status
  from public.inventory_items
  where id = v_item_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    return v_winner_id;
  end if;

  if p_distribution_status = 'distributed' and v_item_status = 'reserved' then
    insert into public.inventory_movements
      (tenant_id, inventory_item_id, movement_type, quantity, occurred_at,
       reason, event_id, recipient_person_id)
    values
      (v_tenant_id, v_item_id, 'distributed', 1,
       coalesce((p_distributed_at + time '12:00') at time zone 'UTC', now()),
       'Giveaway prize awarded',
       v_event_id, v_winner_person_id);

    update public.inventory_items
    set status = 'distributed'
    where id = v_item_id
      and tenant_id = v_tenant_id;

  elsif p_distribution_status is distinct from 'distributed'
    and v_item_status = 'distributed' then
    insert into public.inventory_movements
      (tenant_id, inventory_item_id, movement_type, quantity, reason, event_id)
    values
      (v_tenant_id, v_item_id, 'corrected', 1,
       'Giveaway prize distribution reversed', v_event_id);

    update public.inventory_items
    set status = 'reserved'
    where id = v_item_id
      and tenant_id = v_tenant_id;
  end if;

  return v_winner_id;
end;
$$;

grant execute on function public.upsert_giveaway_winner(uuid, text, text, text, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- create_donation_with_items: the caller now names the day
-- ---------------------------------------------------------------------------
--
-- Copied verbatim from 20260907170000 -- plpgsql has no way to extend a
-- function body in place, so the whole thing is re-pasted, as that migration
-- itself did. The only differences are the new `p_donated_at` parameter and the
-- `insert into public.donations` that uses it.

drop function if exists public.create_donation_with_items(text, boolean, text, text, text, text, jsonb, uuid);

create function public.create_donation_with_items(
  p_donor_name text,
  p_donor_is_anonymous boolean,
  p_donor_source_type text,
  p_donor_email text,
  p_donor_phone text,
  p_donor_notes text,
  p_items jsonb,
  p_event_id uuid default null,
  p_donated_at date default null
)
returns table (donation_id uuid, inventory_item_ids uuid[], giveaway_id uuid, untiered_item_ids uuid[])
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
  v_category_id uuid;
  v_tier_text text;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not (public.has_permission('finance', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a donation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'At least one item is required';
  end if;

  if p_event_id is not null and not exists (
    select 1 from public.events where id = p_event_id and tenant_id = v_tenant_id
  ) then
    raise exception 'Event not found';
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

  -- The caller's own calendar day, not the database's. `current_date` on a
  -- UTC server is already tomorrow for anyone recording an evening intake west
  -- of Greenwich, which is exactly when gear arrives -- at an event, after
  -- dark. It stays as the fallback for a direct SQL insert that names no day.
  insert into public.donations (donor_id, event_id, donated_at)
  values (v_donor_id, p_event_id, coalesce(p_donated_at, current_date))
  returning id into v_donation_id;

  if p_event_id is not null then
    select g.id into v_giveaway_id
    from public.giveaways g
    where g.event_id = p_event_id
      and g.tenant_id = v_tenant_id
      and exists (select 1 from public.giveaway_tiers t where t.giveaway_id = g.id);
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_category_id := null;
    if nullif(v_item->>'category_key', '') is not null then
      select c.id into v_category_id
      from public.inventory_categories c
      where c.key = v_item->>'category_key'
        and c.tenant_id = v_tenant_id;
    end if;
    if v_category_id is null then
      v_category_id := public.resolve_inventory_category(v_item->>'type', v_tenant_id);
    end if;

    insert into public.inventory_items
      (donation_id, description, size, type, gender, condition, face_value, notes, intended_use, category_id, photo_url)
    values (
      v_donation_id,
      v_item->>'description',
      v_item->>'size',
      v_item->>'type',
      v_item->>'gender',
      v_item->>'condition',
      nullif(v_item->>'face_value', '')::numeric,
      v_item->>'notes',
      coalesce(nullif(v_item->>'intended_use', ''), 'gear_library'),
      v_category_id,
      -- Anything that isn't an http(s) URL is dropped rather than stored; see
      -- the header comment.
      case when v_item->>'photo_url' ~ '^https?://' then v_item->>'photo_url' end
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
        select concat_ws(' ', g.label, c.label, v_item->>'type')
        into v_tier_text
        from public.inventory_categories c
        join public.inventory_category_groups g on g.id = c.group_id
        where c.id = v_category_id;

        v_tier_id := public.suggest_giveaway_tier(
          v_giveaway_id, coalesce(v_tier_text, v_item->>'type')
        );
      end if;

      if v_tier_id is null then
        v_untiered := array_append(v_untiered, v_item_id);
      else
        perform public.grant_giveaway_tickets(
          v_giveaway_id, v_tier_id, 1, v_donation_id, v_item_id, null
        );
      end if;
    end if;
  end loop;

  return query select v_donation_id, v_item_ids, v_giveaway_id, v_untiered;
end;
$$;

grant execute on function public.create_donation_with_items(text, boolean, text, text, text, text, jsonb, uuid, date) to authenticated;
