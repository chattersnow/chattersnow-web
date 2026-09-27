-- Distribute an item from its page (#1443): the draft keeps its recipient.
--
-- A handout started from an item page picks the recipient first and then adds
-- the rest of the gear by tapping tags. On an iPhone each tap opens a *new*
-- Safari tab, which knows nothing of the recipient chosen in the first one, so
-- the recipient is stored on the draft beside its event: the resolver can
-- name who the list is for, and whichever tab records it records it for them.
--
-- Two functions come with it: one stores the recipient, one moves a draft to
-- another event (the item page's modal defaults to the active event and can be
-- changed). Both are security invoker, so every write goes through the draft
-- tables' owner-only policies (20260923190000).

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.inventory_distribution_drafts
  add column recipient_person_id uuid,
  -- Deleting the person leaves the list, just without anyone to give it to.
  add constraint inventory_distribution_drafts_recipient_in_tenant
    foreign key (tenant_id, recipient_person_id)
    references public.people (tenant_id, id) on delete set null (recipient_person_id);

create index inventory_distribution_drafts_recipient_idx
  on public.inventory_distribution_drafts (tenant_id, recipient_person_id)
  where recipient_person_id is not null;

comment on column public.inventory_distribution_drafts.recipient_person_id is
  'Who the in-progress distribution is for (#1443), so a tag opened in another tab adds to the same person''s handout. record_distribution_draft() defaults to it.';

-- ---------------------------------------------------------------------------
-- 2. Setting the recipient
-- ---------------------------------------------------------------------------

-- Creates the caller's draft for the context if there is none, so a recipient
-- can be picked before the first scan. Null clears it.
create function public.set_distribution_draft_recipient(
  p_event_id uuid default null,
  p_person_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_draft_id uuid;
begin
  insert into public.inventory_distribution_drafts (event_id, recipient_person_id)
  values (p_event_id, p_person_id)
  on conflict (tenant_id, user_id, event_id) do update
    set recipient_person_id = excluded.recipient_person_id,
        updated_at = now()
  returning id into v_draft_id;

  return v_draft_id;
end;
$$;

revoke execute on function public.set_distribution_draft_recipient(uuid, uuid) from public, anon;
grant execute on function public.set_distribution_draft_recipient(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Moving a draft to another event
-- ---------------------------------------------------------------------------

-- The caller's draft for p_from_event_id becomes their draft for
-- p_to_event_id. If they already have one there, the two lists are merged
-- into it (a piece on both is kept once) and the moved draft's recipient wins
-- when it has one. Returns the resulting draft's id, or null when there was
-- nothing to move.
create function public.move_distribution_draft(
  p_from_event_id uuid default null,
  p_to_event_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_from public.inventory_distribution_drafts%rowtype;
  v_to_id uuid;
begin
  select * into v_from
    from public.inventory_distribution_drafts
   where user_id = auth.uid()
     and event_id is not distinct from p_from_event_id;

  if v_from.id is null then
    return null;
  end if;
  if p_from_event_id is not distinct from p_to_event_id then
    return v_from.id;
  end if;

  select id into v_to_id
    from public.inventory_distribution_drafts
   where user_id = auth.uid()
     and event_id is not distinct from p_to_event_id;

  if v_to_id is null then
    update public.inventory_distribution_drafts
       set event_id = p_to_event_id
     where id = v_from.id;
    return v_from.id;
  end if;

  insert into public.inventory_distribution_draft_items (draft_id, item_id, created_at)
  select v_to_id, item_id, created_at
    from public.inventory_distribution_draft_items
   where draft_id = v_from.id
  on conflict (tenant_id, draft_id, item_id) do nothing;

  update public.inventory_distribution_drafts
     set recipient_person_id = coalesce(v_from.recipient_person_id, recipient_person_id),
         updated_at = now()
   where id = v_to_id;

  delete from public.inventory_distribution_drafts where id = v_from.id;
  return v_to_id;
end;
$$;

revoke execute on function public.move_distribution_draft(uuid, uuid) from public, anon;
grant execute on function public.move_distribution_draft(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Recording defaults to the stored recipient
-- ---------------------------------------------------------------------------

-- Unchanged from 20260923190000 but for the recipient: an explicit
-- p_recipient_person_id still wins, and without one the draft's is used.
create or replace function public.record_distribution_draft(
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
  v_recipient_id uuid;
  v_item_id uuid;
  v_count integer := 0;
begin
  select id, coalesce(p_recipient_person_id, recipient_person_id)
    into v_draft_id, v_recipient_id
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
        v_item_id, 1, p_reason, p_event_id, v_recipient_id,
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
