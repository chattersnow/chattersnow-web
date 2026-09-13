-- #1005: a sponsor donates several things at once -- a board, a pair of
-- goggles, five tees, four lift tickets -- and each one has its own fate. One
-- becomes a giveaway prize, another goes into a different prize, another goes
-- to the gear library where the public can see and request it.
--
-- Until now `sync_event_sponsor_donations` (20260830180000, last redefined in
-- 20260904000000) mirrored an in-kind sponsorship into `donations` plus
-- *exactly one* `inventory_items` row, built from the single
-- `in_kind_description` string and the single `contribution_value` number, and
-- stored that row's id in `event_sponsors.inventory_item_id`. Everything
-- downstream is per item, so the whole contribution collapsed into one
-- undifferentiated record nothing could act on.
--
-- The items are the inventory rows under `event_sponsors.donation_id`. There is
-- deliberately no `event_sponsor_items` table: #520's whole point was to fold
-- sponsor contributions into the shared donation model "instead of leaving them
-- in a silo no other page reads", and a parallel table would rebuild that silo.
-- Because they are ordinary inventory rows, two things already work with no
-- change at all -- `list_available_giveaway_sources` (20260830190000) lists
-- every inventory item on the event's donations, so each item appears
-- separately in the prize-source picker; and `public_gear_catalog`
-- (20260904000000) publishes the ones marked `gear_library`, which is how a
-- sponsor's goods reach the public site for the first time.
--
-- Not in scope, and the reason `giveaway_prizes.source_inventory_item_id` is
-- untouched here: one prize made of several items. That needs a
-- `giveaway_prize_items` join table and a rewrite of the allocate/release
-- reservation RPCs from 20260901070000.
--
-- `'both'` gains the in-kind half it never had. 20260830180000 left it
-- unmirrored entirely because one `contribution_value` field cannot be split
-- into a cash amount and an in-kind face value without fabricating a number --
-- but items carry their own values now, so the goods half no longer needs
-- splitting and a cash+in-kind sponsor's gear stops being invisible to
-- Inventory. The cash half stays unmirrored for the original reason, which
-- also means no finance total moves: `monetary_donations` is untouched here.

-- ---------------------------------------------------------------------------
-- 1. The single-item column
-- ---------------------------------------------------------------------------

-- Wrong by construction once a sponsorship has more than one item: it can only
-- ever name one of them. Fully derived from `donation_id` and rendered nowhere
-- -- `sponsors-actions.ts` selected it and no component read it -- so it goes
-- rather than lingering as a column that is right only for legacy rows.
alter table public.event_sponsors drop column inventory_item_id;

comment on column public.event_sponsors.donation_id is
  'The donation holding this sponsorship''s in-kind items (#520, #1005). Its `inventory_items` rows are the items; there is one per thing the sponsor gave, and each carries its own value and intended_use.';

comment on column public.event_sponsors.in_kind_description is
  'Derived summary of the in-kind item descriptions, written by sync_event_sponsor_donations (#1005). Staff edit the items, not this string; it stays so legacy readers and pre-#1005 rows keep rendering.';

-- ---------------------------------------------------------------------------
-- 2. Removing items safely
-- ---------------------------------------------------------------------------

-- Internal helper, deliberately not granted to `authenticated`: it deletes
-- inventory rows with no permission check of its own, exactly like
-- `grant_giveaway_tickets` (20260904100000). Its callers authorize.
--
-- The guard matters because `giveaway_prizes.source_inventory_item_id` is
-- `on delete set null` (20260830170000): deleting an allocated item would empty
-- the prize in place rather than fail, and the staffer editing a sponsor would
-- never learn they had just gutted the giveaway. A reserved or distributed item
-- has movement history that must not be orphaned either, so anything beyond the
-- one auto-created 'received' row blocks the delete too.
create or replace function public.delete_sponsor_inventory_items(
  p_donation_id uuid,
  p_keep uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep uuid[] := coalesce(p_keep, array[]::uuid[]);
  v_blocked text;
begin
  select string_agg(ii.description, ', ' order by ii.created_at)
    into v_blocked
  from public.inventory_items ii
  where ii.donation_id = p_donation_id
    and not (ii.id = any(v_keep))
    and (
      exists (
        select 1 from public.giveaway_prizes gp
        where gp.source_inventory_item_id = ii.id
      )
      or exists (
        select 1 from public.inventory_movements m
        where m.inventory_item_id = ii.id
          and m.movement_type <> 'received'
      )
    );

  if v_blocked is not null then
    raise exception
      'Remove the giveaway prize or distribution that uses % before removing the item.',
      v_blocked;
  end if;

  -- `inventory_movements.inventory_item_id` has no on-delete action, so its
  -- rows go first. `giveaway_ticket_grants.inventory_item_id` is
  -- `on delete cascade` (20260904100000) and needs nothing here.
  delete from public.inventory_movements
  where inventory_item_id in (
    select ii.id from public.inventory_items ii
    where ii.donation_id = p_donation_id and not (ii.id = any(v_keep))
  );

  delete from public.inventory_items
  where donation_id = p_donation_id and not (id = any(v_keep));
end;
$$;

comment on function public.delete_sponsor_inventory_items(uuid, uuid[]) is
  'Deletes the donation''s inventory items except those in p_keep, refusing when one is a giveaway prize source or carries movement history beyond its intake (#1005). Internal helper: security definer with no permission check, so execute is deliberately not granted to authenticated.';

-- ---------------------------------------------------------------------------
-- 3. The mirror, now over a list
-- ---------------------------------------------------------------------------

-- The parameter list changes, so these are drop+create rather than
-- `create or replace` -- the latter would leave the old arity behind as a
-- second overload and PostgREST would pick between them by argument name.
-- `p_in_kind_description` is gone from both write RPCs: the summary is derived
-- from the items now, so a caller-supplied one would only contradict them.
drop function if exists public.sync_event_sponsor_donations(uuid);
drop function if exists public.create_event_sponsor(uuid, uuid, text, text, numeric, boolean, text, text, text);
drop function if exists public.update_event_sponsor(uuid, text, text, numeric, boolean, text, text, text);
drop function if exists public.delete_event_sponsor(uuid);

-- Body is 20260904000000's with the in-kind branch replaced by a reconcile over
-- p_items; the cash branch and the tenant predicates from 20260906090000 are
-- unchanged. Each element is
--   { "id": uuid|null, "description": text, "face_value": numeric|null,
--     "intended_use": "gear_library"|"giveaway"|"internal" }
-- where a null id means a row to create.
create or replace function public.sync_event_sponsor_donations(
  p_sponsor_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_person_id uuid;
  v_support_type text;
  v_contribution_value numeric;
  v_notes text;
  v_donation_id uuid;
  v_monetary_donation_id uuid;
  v_wants_cash boolean;
  v_wants_in_kind boolean;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_item jsonb;
  v_item_id uuid;
  v_description text;
  v_intended_use text;
  v_keep uuid[] := array[]::uuid[];
  v_new_id uuid;
  v_summary text;
begin
  select event_id, person_id, support_type, contribution_value,
         notes, donation_id, monetary_donation_id
  into v_event_id, v_person_id, v_support_type, v_contribution_value,
       v_notes, v_donation_id, v_monetary_donation_id
  from public.event_sponsors
  where id = p_sponsor_id;

  if not found then
    return;
  end if;

  v_wants_cash := v_support_type = 'cash'
    and v_contribution_value is not null and v_contribution_value > 0;
  v_wants_in_kind := v_support_type in ('in_kind', 'both')
    and jsonb_array_length(v_items) > 0;

  -- Cash side: monetary_donations. Unchanged.
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

  -- In-kind side: one donation, one inventory_items row per item.
  if v_wants_in_kind then
    if v_donation_id is null then
      insert into public.donations (donor_id, event_id, notes)
      values (v_person_id, v_event_id, v_notes)
      returning id into v_donation_id;

      update public.event_sponsors set donation_id = v_donation_id where id = p_sponsor_id;
    else
      update public.donations set notes = v_notes where id = v_donation_id;
    end if;

    for v_item in select * from jsonb_array_elements(v_items)
    loop
      v_description := btrim(coalesce(v_item->>'description', ''));
      if v_description = '' then
        raise exception 'Every in-kind item needs a description.';
      end if;

      v_intended_use := coalesce(nullif(v_item->>'intended_use', ''), 'giveaway');
      if v_intended_use not in ('gear_library', 'giveaway', 'internal') then
        raise exception 'Unknown intended use % for item %.', v_intended_use, v_description;
      end if;

      -- The id is only honoured when it already belongs to this sponsorship's
      -- donation, so a crafted payload cannot reach another sponsor's items.
      v_item_id := nullif(v_item->>'id', '')::uuid;
      if v_item_id is not null and exists (
        select 1 from public.inventory_items
        where id = v_item_id and donation_id = v_donation_id
      ) then
        update public.inventory_items
        set description = v_description,
            face_value = nullif(v_item->>'face_value', '')::numeric,
            intended_use = v_intended_use
        where id = v_item_id;
      else
        -- `type` stays 'other' as it always has; the `set_inventory_item_category`
        -- trigger (20260904150000) resolves category_id from it, and staff refine
        -- category, condition and size from Inventory > Items.
        --
        -- created_at is clock_timestamp() rather than the column's default,
        -- which is now() and therefore identical for every row written in one
        -- transaction. With the timestamps tied, `order by created_at, id` falls
        -- through to a random uuid, so the item list and the summary below came
        -- back in a different order on every save. The rows really were created
        -- at these instants, and the order is the one the staffer typed.
        insert into public.inventory_items
          (donation_id, description, type, condition, face_value, intended_use, created_at)
        values (
          v_donation_id,
          v_description,
          'other',
          'new',
          nullif(v_item->>'face_value', '')::numeric,
          v_intended_use,
          clock_timestamp()
        )
        returning id into v_item_id;

        insert into public.inventory_movements
          (inventory_item_id, movement_type, quantity, reason, event_id)
        values (v_item_id, 'received', 1, 'Sponsor contribution', v_event_id);
      end if;

      v_keep := v_keep || v_item_id;
    end loop;

    perform public.delete_sponsor_inventory_items(v_donation_id, v_keep);

    select string_agg(ii.description, ', ' order by ii.created_at, ii.id)
      into v_summary
    from public.inventory_items ii
    where ii.donation_id = v_donation_id;

    update public.event_sponsors
    set in_kind_description = v_summary
    where id = p_sponsor_id;
  elsif v_donation_id is not null then
    perform public.delete_sponsor_inventory_items(v_donation_id, array[]::uuid[]);
    delete from public.donations where id = v_donation_id;
    update public.event_sponsors
    set donation_id = null, in_kind_description = null
    where id = p_sponsor_id;
  end if;
end;
$$;

comment on function public.sync_event_sponsor_donations(uuid, jsonb) is
  'Reconciles a sponsorship''s mirror in the shared donation model (#520, #1005): one monetary_donations row for cash, and one donations row holding one inventory_items row per in-kind item. Items with an id are updated, items without are created, and items under the donation that the payload omits are removed through delete_sponsor_inventory_items.';

create or replace function public.create_event_sponsor(
  p_event_id uuid,
  p_person_id uuid,
  p_support_type text,
  p_contribution_value numeric,
  p_is_public boolean,
  p_notes text,
  p_follow_up_status text,
  p_follow_up_notes text,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sponsor_id uuid;
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  if not exists (select 1 from public.events where id = p_event_id and tenant_id = v_tenant_id) then
    raise exception 'Event not found';
  end if;
  if not exists (select 1 from public.people where id = p_person_id and tenant_id = v_tenant_id) then
    raise exception 'No such person';
  end if;

  insert into public.event_sponsors (
    event_id, person_id, support_type, contribution_value,
    is_public, notes, follow_up_status, follow_up_notes
  )
  values (
    p_event_id, p_person_id, p_support_type, p_contribution_value,
    p_is_public, p_notes, p_follow_up_status, p_follow_up_notes
  )
  returning id into v_sponsor_id;

  perform public.sync_event_sponsor_donations(v_sponsor_id, p_items);

  return v_sponsor_id;
end;
$$;

create or replace function public.update_event_sponsor(
  p_id uuid,
  p_support_type text,
  p_contribution_value numeric,
  p_is_public boolean,
  p_notes text,
  p_follow_up_status text,
  p_follow_up_notes text,
  p_items jsonb default '[]'::jsonb
)
returns void
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
      contribution_value = p_contribution_value,
      is_public = p_is_public,
      notes = p_notes,
      follow_up_status = p_follow_up_status,
      follow_up_notes = p_follow_up_notes
  where id = p_id
    and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'Sponsor not found';
  end if;

  perform public.sync_event_sponsor_donations(p_id, p_items);
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
  v_monetary_donation_id uuid;
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to manage sponsors';
  end if;

  select donation_id, monetary_donation_id
  into v_donation_id, v_monetary_donation_id
  from public.event_sponsors
  where id = p_id
    and tenant_id = (select public.current_tenant_id());

  if not found then
    return;
  end if;

  if v_donation_id is not null then
    -- Same guard as an edit: removing a sponsor whose gear is already a prize
    -- or already went out the door fails loudly instead of emptying the prize.
    perform public.delete_sponsor_inventory_items(v_donation_id, array[]::uuid[]);
    delete from public.donations where id = v_donation_id;
  end if;

  if v_monetary_donation_id is not null then
    delete from public.monetary_donations where id = v_monetary_donation_id;
  end if;

  delete from public.event_sponsors where id = p_id;
end;
$$;

grant execute on function public.create_event_sponsor(
  uuid, uuid, text, numeric, boolean, text, text, text, jsonb
) to authenticated;
grant execute on function public.update_event_sponsor(
  uuid, text, numeric, boolean, text, text, text, jsonb
) to authenticated;
grant execute on function public.delete_event_sponsor(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reading the items back
-- ---------------------------------------------------------------------------

-- `inventory_items` is gated on inventory:view, which event_coordinator -- the
-- role that manages events and sponsors -- holds none of, so the Sponsors tab
-- cannot select it under the caller's own RLS. Same boundary and same shape as
-- `list_available_giveaway_sources` (20260830190000).
create or replace function public.list_event_sponsor_items(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.has_permission('events', 'view') then
    raise exception 'Not authorized to view sponsor items';
  end if;

  select coalesce(jsonb_object_agg(t.sponsor_id, t.items), '{}'::jsonb)
    into v_result
  from (
    select es.id::text as sponsor_id,
           jsonb_agg(
             jsonb_build_object(
               'id', ii.id,
               'description', ii.description,
               'face_value', ii.face_value,
               'intended_use', ii.intended_use,
               'status', ii.status,
               -- Lets the tab disable removal of an item the giveaway already
               -- claims, rather than letting the staffer hit the exception.
               'allocated', exists (
                 select 1 from public.giveaway_prizes gp
                 where gp.source_inventory_item_id = ii.id
               )
             )
             order by ii.created_at, ii.id
           ) as items
    from public.event_sponsors es
    join public.inventory_items ii on ii.donation_id = es.donation_id
    where es.event_id = p_event_id
      and es.tenant_id = (select public.current_tenant_id())
    group by es.id
  ) t;

  return v_result;
end;
$$;

comment on function public.list_event_sponsor_items(uuid) is
  'Every event sponsorship''s in-kind items, keyed by sponsor id (#1005). Security definer because inventory_items is gated on inventory:view and event_coordinator holds none of it; isolation is the event_sponsors tenant predicate.';

grant execute on function public.list_event_sponsor_items(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Backfill
-- ---------------------------------------------------------------------------

-- Sponsorships recorded before the #520 mirror existed have an
-- in_kind_description and no donation at all, so they would read back with no
-- items and lose their text on the next edit. Give each one the donation and
-- item the mirror would have made.
--
-- tenant_id, donor and actor are all named rather than defaulted: a migration
-- runs with no session user, so `auth.uid()` is null against three `not null`
-- created_by columns, and `default_tenant_id()` resolves only when there is
-- exactly one active tenant -- true of a local `db reset`, false of the hosted
-- project (docs/tenants.md, "Writing migrations on a multi-tenant database").
do $$
declare
  r record;
  v_donation_id uuid;
  v_item_id uuid;
begin
  for r in
    select id, tenant_id, event_id, person_id, in_kind_description,
           contribution_value, notes, created_by
    from public.event_sponsors
    where support_type in ('in_kind', 'both')
      and donation_id is null
      and (in_kind_description is not null or contribution_value is not null)
  loop
    insert into public.donations (tenant_id, donor_id, event_id, notes, created_by)
    values (r.tenant_id, r.person_id, r.event_id, r.notes, r.created_by)
    returning id into v_donation_id;

    insert into public.inventory_items
      (tenant_id, donation_id, description, type, condition, face_value, intended_use, created_by)
    values (
      r.tenant_id,
      v_donation_id,
      coalesce(nullif(btrim(r.in_kind_description), ''), 'Sponsor in-kind contribution'),
      'other',
      'new',
      r.contribution_value,
      'giveaway',
      r.created_by
    )
    returning id into v_item_id;

    insert into public.inventory_movements
      (tenant_id, inventory_item_id, movement_type, quantity, reason, event_id, created_by)
    values (r.tenant_id, v_item_id, 'received', 1, 'Sponsor contribution', r.event_id, r.created_by);

    update public.event_sponsors set donation_id = v_donation_id where id = r.id;
  end loop;
end $$;
