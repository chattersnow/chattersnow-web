-- Retiring an item's random asset-tag code once it has a numbered code (#1544).
--
-- An item that intake gave a random code (#1420) and that later got a
-- reusable numbered code (#1444) has two scannable identities. The Codes page
-- (#1450) could retire a code on no item, or a numbered code, but refused a
-- random code on an item ("reprint its label instead"), so there was no way
-- to clean these up. This adds:
--
--   * retiring a random code that is on an item, from the Codes page or as
--     the numbered code goes on, with a new reason, 'replaced' (by a numbered
--     code). It comes off the item, since a retired code is on no item
--     (inventory_item_tags_retired_unbound);
--   * a guard: an item's last code -- random, numbered or NFC -- is retired
--     only when the caller says so (p_allow_last), so nothing is left
--     untagged by accident;
--   * a bulk form for the backlog, by item: retire the random code on every
--     item that has a numbered code, and skip the rest; and
--   * history: the random code's time on its item is kept in
--     inventory_item_tag_assignments, so the item page and the code's own
--     history still show that the item once carried it.
--
-- A code coming off its item because the code was retired gets its own
-- release reason, 'code_retired'. Until now that used 'retired', which also
-- means "the item was retired" and read that way on the item page.

-- ---------------------------------------------------------------------------
-- 1. Reasons
-- ---------------------------------------------------------------------------

alter table public.inventory_item_tags
  drop constraint inventory_item_tags_retired_reason_check,
  add constraint inventory_item_tags_retired_reason_check
    check (retired_reason in ('damaged', 'lost', 'replaced', 'other'));

alter table public.inventory_item_tag_assignments
  drop constraint inventory_item_tag_assignments_release_reason_check,
  add constraint inventory_item_tag_assignments_release_reason_check
    check (release_reason in (
      'distributed', 'retired', 'lost', 'moved', 'replaced', 'unassigned',
      'code_retired'
    ));

comment on column public.inventory_item_tags.retired_reason is
  'Why the code was retired (#1450, #1544): damaged, lost, replaced (an item''s random code, once the item has a numbered code) or other.';

-- ---------------------------------------------------------------------------
-- 2. A random code's time on its item, kept when it comes off
-- ---------------------------------------------------------------------------

-- record_inventory_tag_assignment() from 20260927200000. Numbered codes are
-- recorded as before. A random code is bound once, when its item is made or
-- received, and that binding is already in the code's own history; so it is
-- written here only as it comes off, as one closed row from when its item
-- arrived. Only retiring takes a random code off an item.
create or replace function public.record_inventory_tag_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('app.inventory_tag_release_reason', true), '');
begin
  if new.kind = 'asset_tag' then
    if tg_op = 'UPDATE' and old.item_id is not null and new.item_id is null then
      insert into public.inventory_item_tag_assignments
        (tenant_id, tag_id, item_id, assigned_at, assigned_by,
         released_at, released_by, release_reason)
      select new.tenant_id, new.id, old.item_id,
             greatest(old.created_at, i.created_at), i.created_by,
             now(), auth.uid(), coalesce(v_reason, 'unassigned')
        from public.inventory_items i
       where i.tenant_id = new.tenant_id and i.id = old.item_id;
    end if;
    return null;
  end if;
  if new.kind <> 'numbered' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.item_id is not distinct from new.item_id then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.item_id is not null then
    update public.inventory_item_tag_assignments
       set released_at = now(),
           released_by = auth.uid(),
           release_reason = coalesce(
             v_reason,
             case when new.item_id is null then 'unassigned' else 'moved' end
           )
     where tenant_id = new.tenant_id
       and tag_id = new.id
       and released_at is null;
  end if;

  if new.item_id is not null then
    insert into public.inventory_item_tag_assignments (tenant_id, tag_id, item_id)
    values (new.tenant_id, new.id, new.item_id);
  end if;
  return null;
end;
$$;

comment on table public.inventory_item_tag_assignments is
  'Each time a numbered inventory tag code (#1444) was on an item: from when, until when, and why it came off -- and, once it comes off, a random asset-tag code''s time on its item (#1544). Written only by the trigger on inventory_item_tags, so it cannot disagree with the tag''s item_id.';

-- ---------------------------------------------------------------------------
-- 3. Retiring, now including a random code on an item
-- ---------------------------------------------------------------------------

-- retire_inventory_tags() from 20260928090000, with a fourth argument and an
-- item_id column, so it is dropped rather than overloaded. One row per code
-- asked for:
--
--   outcome 'retired'   -- done. released_from and item_id name the item it
--                          came off, if it was on one.
--   outcome 'already'   -- it was retired already; nothing changed.
--   outcome 'last_tag'  -- it is the only code on its item, and p_allow_last
--                          was not given. Nothing changed; item_id and
--                          released_from name the item, so the caller can ask.
--   outcome 'not_ours'  -- an NFC serial or a barcode, which we don't print.
--   outcome 'unknown'   -- no such code in this tenant.
--
-- An item's codes, for the last-code guard, are its random, numbered and NFC
-- codes: a manufacturer barcode names a product, not this item.
drop function public.retire_inventory_tags(uuid[], text, text);

create function public.retire_inventory_tags(
  p_tag_ids uuid[],
  p_reason text,
  p_note text default null,
  p_allow_last boolean default false
)
returns table (tag_id uuid, code text, outcome text, released_from text, item_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
  v_tag public.inventory_item_tags%rowtype;
  v_item text;
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'Not authorized to retire tag codes';
  end if;
  if p_reason is null or p_reason not in ('damaged', 'lost', 'replaced', 'other') then
    raise exception 'INVENTORY_TAG_RETIRE_REASON';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'INVENTORY_TAG_RETIRE_NOTE';
  end if;
  if coalesce(cardinality(p_tag_ids), 0) > 500 then
    raise exception 'Too many codes at once';
  end if;

  foreach v_id in array coalesce(p_tag_ids, '{}') loop
    v_tag := null;
    v_item := null;
    select * into v_tag
      from public.inventory_item_tags t
     where t.tenant_id = v_tenant_id and t.id = v_id
       for update;

    if v_tag.id is null then
      return query select v_id, null::text, 'unknown'::text, null::text, null::uuid;
      continue;
    end if;
    if v_tag.kind not in ('asset_tag', 'numbered') then
      return query select v_id, v_tag.value, 'not_ours'::text, null::text, null::uuid;
      continue;
    end if;
    if v_tag.retired_at is not null then
      return query select v_id, v_tag.value, 'already'::text, null::text, null::uuid;
      continue;
    end if;

    if v_tag.item_id is not null then
      select i.description into v_item
        from public.inventory_items i
       where i.tenant_id = v_tenant_id and i.id = v_tag.item_id;

      if not coalesce(p_allow_last, false) and not exists (
        select 1 from public.inventory_item_tags o
         where o.tenant_id = v_tenant_id
           and o.item_id = v_tag.item_id
           and o.id <> v_tag.id
           and o.kind in ('asset_tag', 'numbered', 'nfc')
      ) then
        return query select v_id, v_tag.value, 'last_tag'::text, v_item, v_tag.item_id;
        continue;
      end if;

      perform set_config('app.inventory_tag_release_reason', 'code_retired', true);
      update public.inventory_item_tags t set item_id = null where t.id = v_tag.id;
      perform set_config('app.inventory_tag_release_reason', '', true);
    end if;

    update public.inventory_item_tags t
       set retired_at = now(),
           retired_by = auth.uid(),
           retired_reason = p_reason,
           retired_note = v_note
     where t.id = v_tag.id;

    return query select v_id, v_tag.value, 'retired'::text, v_item, v_tag.item_id;
  end loop;
end;
$$;

comment on function public.retire_inventory_tags(uuid[], text, text, boolean) is
  'Retires codes (#1450, #1544): a damaged or lost tag, or an item''s random code replaced by a numbered code. A code on an item comes off it (release reason code_retired), unless it is the item''s last code and p_allow_last is not set (outcome last_tag). A retired code is never bound again. inventory:manage.';

revoke execute on function public.retire_inventory_tags(uuid[], text, text, boolean) from public, anon;
grant execute on function public.retire_inventory_tags(uuid[], text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The backlog, by item
-- ---------------------------------------------------------------------------

-- For the Items list and for assigning a numbered code: retire the random
-- code on each of these items that has a numbered code. One row per item
-- without one, and per code retired:
--
--   outcome 'retired'      -- code is the random code retired.
--   outcome 'no_numbered'  -- skipped: retiring would leave it no code it
--                             was meant to keep.
--   outcome 'no_tag_code'  -- it has a numbered code and no random one.
--   outcome 'unknown'      -- no such item in this tenant.
--
-- Security invoker, through retire_inventory_tags() and RLS.
create function public.retire_item_asset_tag_codes(
  p_item_ids uuid[],
  p_reason text default 'replaced',
  p_note text default null
)
returns table (item_id uuid, description text, code text, outcome text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_item_id uuid;
  v_description text;
  v_tag_ids uuid[];
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'Not authorized to retire tag codes';
  end if;
  if coalesce(cardinality(p_item_ids), 0) > 500 then
    raise exception 'Too many items at once';
  end if;

  foreach v_item_id in array coalesce(p_item_ids, '{}') loop
    v_description := null;
    select i.description into v_description
      from public.inventory_items i
     where i.tenant_id = v_tenant_id and i.id = v_item_id
       for update;
    if not found then
      return query select v_item_id, null::text, null::text, 'unknown'::text;
      continue;
    end if;

    if not exists (
      select 1 from public.inventory_item_tags t
       where t.tenant_id = v_tenant_id
         and t.item_id = v_item_id
         and t.kind = 'numbered'
    ) then
      return query select v_item_id, v_description, null::text, 'no_numbered'::text;
      continue;
    end if;

    select array_agg(t.id order by t.created_at) into v_tag_ids
      from public.inventory_item_tags t
     where t.tenant_id = v_tenant_id
       and t.item_id = v_item_id
       and t.kind = 'asset_tag';
    if v_tag_ids is null then
      return query select v_item_id, v_description, null::text, 'no_tag_code'::text;
      continue;
    end if;

    -- The numbered code is still on the item, so none of these is its last.
    return query
      select v_item_id, v_description, r.code, r.outcome
        from public.retire_inventory_tags(v_tag_ids, p_reason, p_note, false) r;
  end loop;
end;
$$;

comment on function public.retire_item_asset_tag_codes(uuid[], text, text) is
  'Retires the random asset-tag code on each of these items that has a numbered code (#1544), and skips the rest (outcome no_numbered), so nothing is left untagged. inventory:manage.';

revoke execute on function public.retire_item_asset_tag_codes(uuid[], text, text) from public, anon;
grant execute on function public.retire_item_asset_tag_codes(uuid[], text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. One code's history
-- ---------------------------------------------------------------------------

-- inventory_tag_history() from 20260928090000. A random code's assignment row
-- (section 2) starts when its item arrived, which the code's history already
-- shows as created or bound; so only its release is read from it.
create or replace function public.inventory_tag_history(p_tag_id uuid)
returns table (
  occurred_at timestamptz,
  event text,
  item_id uuid,
  item_description text,
  detail text,
  actor_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_tag public.inventory_item_tags%rowtype;
begin
  if not public.has_permission('inventory', 'view') then
    raise exception 'Not authorized to read tag history';
  end if;

  select * into v_tag
    from public.inventory_item_tags t
   where t.tenant_id = v_tenant_id and t.id = p_tag_id;
  if v_tag.id is null or v_tag.kind = 'barcode' then
    return;
  end if;

  return query
  with audit as (
    select a.occurred_at, a.action, a.actor_id, a.old_data, a.new_data
      from public.audit_log a
     where a.table_name = 'inventory_item_tags'
       and a.record_id = v_tag.id
  ),
  entries as (
    select v_tag.created_at as occurred_at,
           'created'::text as event,
           case when v_tag.kind <> 'numbered' then (
             select (a.new_data ->> 'item_id')::uuid from audit a
              where a.action = 'insert' limit 1
           ) end as item_id,
           null::text as detail,
           v_tag.created_by as actor_id

    union all

    select a.occurred_at, 'bound', (a.new_data ->> 'item_id')::uuid, null, a.actor_id
      from audit a
     where v_tag.kind <> 'numbered'
       and a.action = 'update'
       and a.old_data ->> 'item_id' is null
       and a.new_data ->> 'item_id' is not null

    union all

    select s.assigned_at, 'assigned', s.item_id, null, s.assigned_by
      from public.inventory_item_tag_assignments s
     where s.tenant_id = v_tenant_id and s.tag_id = v_tag.id
       and v_tag.kind = 'numbered'

    union all

    select s.released_at, 'released', s.item_id, s.release_reason, s.released_by
      from public.inventory_item_tag_assignments s
     where s.tenant_id = v_tenant_id and s.tag_id = v_tag.id
       and s.released_at is not null

    union all

    select a.occurred_at, 'printed', null, null, a.actor_id
      from audit a
     where a.action = 'update'
       and (a.new_data ->> 'print_count')::integer
           > coalesce((a.old_data ->> 'print_count')::integer, 0)

    union all

    select a.occurred_at,
           case when a.new_data ->> 'nfc_written_at' is null then 'nfc_cleared' else 'nfc_written' end,
           null, null, a.actor_id
      from audit a
     where a.action = 'update'
       and a.new_data ->> 'nfc_written_at' is distinct from a.old_data ->> 'nfc_written_at'

    union all

    select a.occurred_at,
           case when a.new_data ->> 'retired_at' is null then 'unretired' else 'retired' end,
           null,
           case when a.new_data ->> 'retired_at' is not null then
             concat_ws(': ', a.new_data ->> 'retired_reason', nullif(a.new_data ->> 'retired_note', ''))
           end,
           a.actor_id
      from audit a
     where a.action = 'update'
       and a.new_data ->> 'retired_at' is distinct from a.old_data ->> 'retired_at'
  )
  select e.occurred_at,
         e.event,
         e.item_id,
         i.description,
         e.detail,
         coalesce(
           nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
           u.email
         )::text
    from entries e
    left join public.inventory_items i
      on i.tenant_id = v_tenant_id and i.id = e.item_id
    left join auth.users u on u.id = e.actor_id
   order by e.occurred_at desc,
     case e.event
       when 'retired' then 0 when 'assigned' then 1 when 'released' then 2
       else 3
     end;
end;
$$;
