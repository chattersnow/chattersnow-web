-- Scannable inventory tags, part 3: the in-progress distribution (#1420).
--
-- Scanning a handout builds a list before anything is recorded: each scan adds
-- one piece of gear, a mis-scan is taken back off, and one submit records the
-- lot. That list lives here, on the server, rather than in the browser, for one
-- reason: an iPhone reads an NFC tag natively and opens its URL
-- (/portal/t/<code>) in a *new* Safari tab. That tab has the session but none
-- of the first tab's state, and the resolver can only offer "Add to the
-- distribution" if the list it would add to is somewhere it can read.
--
-- One draft per person per event context: the draft a staffer builds from an
-- event's Distributions card is that event's, and the one built from
-- Inventory -> Distribution (no event) is a separate one. Opening the modal for
-- a different event therefore never inherits another event's scans.
--
-- Deliberately not audited. A draft records nothing: it is a scratch list
-- that is either discarded or turned into inventory_movements by
-- record_distribution_draft(), and those movements -- and the item status
-- change -- are audited where they land.

-- ---------------------------------------------------------------------------
-- 1. The tables
-- ---------------------------------------------------------------------------

create table public.inventory_distribution_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Null for a distribution recorded outside any event.
  event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (tenant_id, id),
  constraint inventory_distribution_drafts_event_in_tenant
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade
);

-- One per person per event, the "no event" draft included.
create unique index inventory_distribution_drafts_one_per_context
  on public.inventory_distribution_drafts (tenant_id, user_id, event_id)
  nulls not distinct;

create trigger set_updated_at before update on public.inventory_distribution_drafts
  for each row execute function public.set_updated_at();

comment on table public.inventory_distribution_drafts is
  'A person''s in-progress, scanned distribution (#1420 part 3): one per person per event (or none), read by the /portal/t/<code> resolver so a tag opened in another tab can be added to it. Turned into movements by record_distribution_draft().';

create table public.inventory_distribution_draft_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  draft_id uuid not null,
  item_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  -- An item is one piece: scanning it twice does not hand it out twice.
  unique (tenant_id, draft_id, item_id),
  constraint inventory_distribution_draft_items_draft_in_tenant
    foreign key (tenant_id, draft_id)
    references public.inventory_distribution_drafts (tenant_id, id) on delete cascade,
  constraint inventory_distribution_draft_items_item_in_tenant
    foreign key (tenant_id, item_id)
    references public.inventory_items (tenant_id, id) on delete cascade
);

create index inventory_distribution_draft_items_item_idx
  on public.inventory_distribution_draft_items (tenant_id, item_id);

comment on table public.inventory_distribution_draft_items is
  'The items scanned into an inventory_distribution_drafts row (#1420 part 3), one row per piece.';

-- ---------------------------------------------------------------------------
-- 2. Row-level security
-- ---------------------------------------------------------------------------

-- A draft is its owner's alone, and only someone who may record a
-- distribution (record_event_distribution's own gate) may keep one. No new
-- resource.
alter table public.inventory_distribution_drafts enable row level security;
alter table public.inventory_distribution_draft_items enable row level security;

create policy "inventory_distribution_drafts owner" on public.inventory_distribution_drafts
  for all to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
    and (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage'))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and user_id = (select auth.uid())
    and (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage'))
  );

create policy "inventory_distribution_draft_items owner" on public.inventory_distribution_draft_items
  for all to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.inventory_distribution_drafts d
       where d.tenant_id = inventory_distribution_draft_items.tenant_id
         and d.id = inventory_distribution_draft_items.draft_id
         and d.user_id = (select auth.uid())
    )
    and (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage'))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and exists (
      select 1 from public.inventory_distribution_drafts d
       where d.tenant_id = inventory_distribution_draft_items.tenant_id
         and d.id = inventory_distribution_draft_items.draft_id
         and d.user_id = (select auth.uid())
    )
    and (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage'))
  );

grant select, insert, update, delete on public.inventory_distribution_drafts to authenticated;
grant select, insert, delete on public.inventory_distribution_draft_items to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Adding to a draft
-- ---------------------------------------------------------------------------

-- Creates the caller's draft for the context if there is none, adds the item
-- (a repeat scan is a no-op), and touches the draft so the resolver can tell
-- a list in use from one left behind. Security invoker: every write goes
-- through the policies above.
create function public.add_to_distribution_draft(p_item_id uuid, p_event_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft_id uuid;
begin
  insert into public.inventory_distribution_drafts (event_id)
  values (p_event_id)
  on conflict (tenant_id, user_id, event_id) do update set updated_at = now()
  returning id into v_draft_id;

  insert into public.inventory_distribution_draft_items (draft_id, item_id)
  values (v_draft_id, p_item_id)
  on conflict (tenant_id, draft_id, item_id) do nothing;

  return v_draft_id;
end;
$$;

revoke execute on function public.add_to_distribution_draft(uuid, uuid) from public, anon;
grant execute on function public.add_to_distribution_draft(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Recording a draft
-- ---------------------------------------------------------------------------

-- One movement per piece through record_event_distribution(), so the batch
-- answers to exactly the same checks as a single handout, then the draft is
-- deleted -- all in one transaction. If any piece was given out by someone
-- else since it was scanned, nothing is recorded and the error's detail names
-- that item, so the list can point at it.
create function public.record_distribution_draft(
  p_event_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_reason text default null,
  p_recipient_person_id uuid default null,
  p_mark_item_distributed boolean default true
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft_id uuid;
  v_item_id uuid;
  v_count integer := 0;
begin
  select id into v_draft_id
    from public.inventory_distribution_drafts
   where user_id = auth.uid()
     and event_id is not distinct from p_event_id;

  if v_draft_id is null then
    raise exception 'DRAFT_EMPTY';
  end if;

  for v_item_id in
    select item_id from public.inventory_distribution_draft_items
     where draft_id = v_draft_id
     order by created_at
  loop
    begin
      perform public.record_event_distribution(
        v_item_id, 1, p_reason, p_event_id, p_recipient_person_id,
        coalesce(p_occurred_at, now()), p_mark_item_distributed
      );
    exception when raise_exception then
      if sqlerrm = 'ITEM_ALREADY_DISTRIBUTED' then
        raise exception 'ITEM_ALREADY_DISTRIBUTED' using detail = v_item_id::text;
      end if;
      raise;
    end;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'DRAFT_EMPTY';
  end if;

  delete from public.inventory_distribution_drafts where id = v_draft_id;
  return v_count;
end;
$$;

revoke execute on function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean) from public, anon;
grant execute on function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Self-check
-- ---------------------------------------------------------------------------

do $check$
declare
  v_policies text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into v_policies
    from pg_policies
   where schemaname = 'public'
     and tablename in ('inventory_distribution_drafts', 'inventory_distribution_draft_items')
     and coalesce(qual, '') || coalesce(with_check, '') not like '%current_tenant_id()%';

  if v_policies is not null then
    raise exception 'distribution draft policies without the tenant predicate: %', v_policies;
  end if;
end;
$check$;
