-- In-person handouts: the as-is acknowledgement by emailed link afterwards (#1519)
-- ---------------------------------------------------------------------------
--
-- #1520 gave the handout checkout its acknowledgement: the recipient's own
-- phone through a one-time QR code, or the staff device handed to them, or a
-- reason staff record instead. #1519 asked for one more way out of the last
-- of those: a recipient with an email address who left before acknowledging
-- (or had no phone, or would not wait) can be mailed a link and acknowledge
-- afterwards, on the shared /acknowledge page #1518 built for gear requests.
--
-- THE HANDOUT IS ALREADY RECORDED WHEN THE LINK IS USED. The QR code's token
-- lives on the draft, and the draft is deleted when the handout is recorded,
-- so the emailed link hangs off the distribution_acknowledgements row the
-- record wrote instead: one link per handout, in its own table, written in
-- the same transaction as the handout so a link never outlives a failed
-- record. Following it fills in the acknowledgement on that row -- method
-- emailed_link -- and KEEPS the reason staff gave, so the item history can
-- still say the handout went out without it at the time.
--
-- Everything else is #1518's shape: the raw token never reaches the database
-- (the Server Action mints it, mails it and passes only its SHA-256), the hash
-- is outside the select grant, the link works for 30 days or until it is used,
-- and every dead link is the one refusal, LINK_INVALID. A recipient anonymized
-- by retention (the person link cleared) kills the link too.
--
-- MEETUP REQUESTS FROM BEFORE #1367. A handout acknowledged at the checkout
-- writes the acknowledgement back to the requests it fulfilled (#1520). The
-- link does the same, so it carries the ids record_distribution_draft()
-- worked out at the time: the holds are gone once the pieces are distributed.

-- ---------------------------------------------------------------------------
-- 1. An acknowledgement can follow a reason
-- ---------------------------------------------------------------------------

-- Was: acknowledged XOR skipped. Now a skipped handout may also be
-- acknowledged afterwards, by emailed link only -- never at the checkout,
-- where a reason and an acknowledgement are still alternatives.
alter table public.distribution_acknowledgements
  drop constraint distribution_acknowledgements_acknowledged_or_skipped,
  add constraint distribution_acknowledgements_acknowledged_or_skipped check (
    (acknowledged_at is not null and as_is_text is not null and method is not null
      and (skipped_reason is null or method = 'emailed_link'))
    or (acknowledged_at is null and as_is_text is null and method is null and skipped_reason is not null)
  );

comment on table public.distribution_acknowledgements is
  'The as-is acknowledgement taken from the recipient at an in-person handout (#1519), or the reason staff recorded it without one -- and then, when the recipient followed the emailed link afterwards, the acknowledgement beside the reason (method emailed_link). Written only by record_distribution_draft() and acknowledge_as_is_by_token(); every inventory_movements row the handout recorded points here.';

-- ---------------------------------------------------------------------------
-- 2. The link
-- ---------------------------------------------------------------------------

create table public.distribution_acknowledgement_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  acknowledgement_id uuid not null,
  -- SHA-256 of the token in the email, hex. Never the token itself.
  token_hash text not null
    constraint distribution_acknowledgement_requests_token_hash_check
      check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users(id) on delete set null,
  -- When the acknowledgement was taken through this link.
  acknowledged_at timestamptz,
  -- Meetup requests from before #1367 the handout fulfilled, written back to
  -- when the link is followed.
  gear_request_ids uuid[] not null default '{}',
  constraint distribution_acknowledgement_requests_acknowledgement_key
    unique (tenant_id, acknowledgement_id),
  constraint distribution_acknowledgement_requests_token_hash_key
    unique (token_hash),
  constraint distribution_acknowledgement_requests_acknowledgement_fkey
    foreign key (tenant_id, acknowledgement_id)
    references public.distribution_acknowledgements (tenant_id, id) on delete cascade
);

comment on table public.distribution_acknowledgement_requests is
  'The emailed link that asks a handout''s recipient to acknowledge the as-is terms after the handout was recorded with a reason (#1519). One row per handout. token_hash is withheld from the select grant, because the public functions accept a hash. Written only by record_distribution_draft() and acknowledge_as_is_by_token(); a failed send deletes it.';

alter table public.distribution_acknowledgement_requests enable row level security;

revoke all on public.distribution_acknowledgement_requests from public, anon, authenticated;
grant select (id, tenant_id, acknowledgement_id, expires_at, requested_at, requested_by, acknowledged_at, gear_request_ids)
  on public.distribution_acknowledgement_requests to authenticated;

-- Read under the same permission as the acknowledgements they belong to.
create policy "distribution_acknowledgement_requests select"
  on public.distribution_acknowledgement_requests
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('inventory', 'view')
  );

-- ---------------------------------------------------------------------------
-- 3. Recording the handout writes it
-- ---------------------------------------------------------------------------

-- 20261005100000's body, with p_link_token_hash and the link_expires_at
-- column added; nothing else changes.
drop function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean, text[], text, text);

create function public.record_distribution_draft(
  p_event_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_reason text default null,
  p_recipient_person_id uuid default null,
  p_mark_item_distributed boolean default true,
  p_removed_tags text[] default '{}',
  p_skipped_reason text default null,
  p_skipped_note text default null,
  p_link_token_hash text default null
)
returns table (recorded integer, released_tags jsonb, link_expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_draft public.inventory_distribution_drafts%rowtype;
  v_item_id uuid;
  v_movement_ids uuid[] := '{}';
  v_missing_tag text;
  v_ack_id uuid;
  v_note text := left(nullif(btrim(coalesce(p_skipped_note, '')), ''), 500);
  v_request_ids uuid[];
  v_link_expires_at timestamptz;
begin
  if not (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a distribution';
  end if;
  if p_link_token_hash is not null and p_link_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'TOKEN_INVALID';
  end if;

  select * into v_draft
    from public.inventory_distribution_drafts
   where tenant_id = v_tenant_id
     and user_id = auth.uid()
     and event_id is not distinct from p_event_id
   for update;

  if v_draft.id is null then
    raise exception 'DRAFT_EMPTY';
  end if;

  -- A recipient named only now is a recipient change, and voids an
  -- acknowledgement given for the one the draft had (the trigger above).
  if p_recipient_person_id is not null
     and p_recipient_person_id is distinct from v_draft.recipient_person_id then
    update public.inventory_distribution_drafts
       set recipient_person_id = p_recipient_person_id
     where id = v_draft.id
    returning * into v_draft;
  end if;

  if not exists (select 1 from public.inventory_distribution_draft_items where draft_id = v_draft.id) then
    raise exception 'DRAFT_EMPTY';
  end if;

  if p_mark_item_distributed then
    select t.value into v_missing_tag
      from public.inventory_distribution_draft_items di
      join public.inventory_item_tags t
        on t.tenant_id = di.tenant_id and t.item_id = di.item_id and t.kind = 'numbered'
     where di.draft_id = v_draft.id
       and not (t.value = any(coalesce(p_removed_tags, '{}')))
     order by t.number
     limit 1;
    if v_missing_tag is not null then
      raise exception 'TAGS_NOT_REMOVED' using detail = v_missing_tag;
    end if;
  end if;

  -- Meetup requests from before #1367, acknowledged here and now.
  select coalesce(array_agg(distinct h.gear_request_id), '{}') into v_request_ids
    from public.distribution_draft_holds(v_draft.id) h
   where h.gear_request_id is not null
     and h.as_is_acknowledged_at is null;

  if v_draft.ack_acknowledged_at is not null then
    insert into public.distribution_acknowledgements
      (tenant_id, recipient_person_id, present_staff, acknowledged_at, as_is_text, typed_name, method)
    values
      (v_tenant_id, v_draft.recipient_person_id, auth.uid(), v_draft.ack_acknowledged_at,
       v_draft.ack_as_is_text, v_draft.ack_typed_name, v_draft.ack_method)
    returning id into v_ack_id;
  elsif p_skipped_reason is not null then
    if p_skipped_reason not in ('left_before_acknowledging', 'no_phone', 'declined_to_wait', 'other')
       or (p_skipped_reason = 'other' and v_note is null) then
      raise exception 'SKIP_REASON_INVALID';
    end if;
    insert into public.distribution_acknowledgements
      (tenant_id, recipient_person_id, present_staff, skipped_reason, skipped_note)
    values
      (v_tenant_id, v_draft.recipient_person_id, auth.uid(), p_skipped_reason, v_note)
    returning id into v_ack_id;
  elsif public.distribution_draft_needs_acknowledgement(v_draft.id) then
    raise exception 'ACKNOWLEDGEMENT_REQUIRED';
  end if;

  for v_item_id in
    select d.item_id from public.inventory_distribution_draft_items d
     where d.draft_id = v_draft.id
     order by d.created_at
  loop
    begin
      v_movement_ids := v_movement_ids || public.record_event_distribution(
        v_item_id, 1, p_reason, p_event_id, v_draft.recipient_person_id,
        coalesce(p_occurred_at, now()), p_mark_item_distributed
      );
    exception when raise_exception then
      if sqlerrm = 'ITEM_ALREADY_DISTRIBUTED' then
        raise exception 'ITEM_ALREADY_DISTRIBUTED' using detail = v_item_id::text;
      end if;
      raise;
    end;
  end loop;

  if v_ack_id is not null then
    update public.inventory_movements
       set distribution_acknowledgement_id = v_ack_id
     where id = any(v_movement_ids);
  end if;

  -- Written back to the request as well, so it reads as acknowledged and
  -- needs no emailed link (#1518).
  if v_draft.ack_acknowledged_at is not null and cardinality(v_request_ids) > 0 then
    update public.gear_requests
       set as_is_acknowledged_at = v_draft.ack_acknowledged_at,
           as_is_text = v_draft.ack_as_is_text,
           as_is_method = 'in_person'
     where tenant_id = v_tenant_id
       and id = any(v_request_ids)
       and as_is_acknowledged_at is null;
  end if;

  -- The emailed link (#1519's fallback): only for a handout recorded with a
  -- reason, and only to a recipient on record. Anything else writes no link,
  -- and the action mails nothing.
  if p_link_token_hash is not null
     and v_ack_id is not null
     and v_draft.ack_acknowledged_at is null
     and v_draft.recipient_person_id is not null then
    v_link_expires_at := now() + interval '30 days';
    insert into public.distribution_acknowledgement_requests
      (tenant_id, acknowledgement_id, token_hash, expires_at, requested_by, gear_request_ids)
    values
      (v_tenant_id, v_ack_id, p_link_token_hash, v_link_expires_at, auth.uid(), v_request_ids);
  end if;

  delete from public.inventory_distribution_drafts where id = v_draft.id;

  return query
  select cardinality(v_movement_ids),
         coalesce(
           (select jsonb_agg(jsonb_build_object(
                     'item_id', r.item_id, 'description', r.description, 'code', r.code))
              from public.released_numbered_inventory_tags(v_movement_ids) r),
           '[]'::jsonb
         ),
         v_link_expires_at;
end;
$$;

comment on function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean, text[], text, text, text) is
  'Records the caller''s handout (#1420, #1519): one distributed movement per piece, every one pointing at the distribution_acknowledgements row it writes from the recipient''s acknowledgement or p_skipped_reason. Raises DRAFT_EMPTY, TAGS_NOT_REMOVED (detail: the first code not ticked), ACKNOWLEDGEMENT_REQUIRED, SKIP_REASON_INVALID, ITEM_ALREADY_DISTRIBUTED (detail: the item) or TOKEN_INVALID. With p_link_token_hash and a reason given, also writes the 30-day emailed link for the recipient to acknowledge afterwards, and returns when it expires (else null).';

revoke execute on function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean, text[], text, text, text) from public, anon;
grant execute on function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean, text[], text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Following the link
-- ---------------------------------------------------------------------------

-- The acknowledgement a live link names on this tenant's public site, or
-- null: unknown, expired, used, acknowledged some other way, the recipient
-- anonymized, or another tenant's.
create function public.resolve_distribution_acknowledgement_link(
  p_token_hash text,
  p_for_update boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acknowledgement_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  if p_for_update then
    select a.id into v_acknowledgement_id
      from public.distribution_acknowledgement_requests l
      join public.distribution_acknowledgements a
        on a.id = l.acknowledgement_id and a.tenant_id = l.tenant_id
     where l.token_hash = p_token_hash
       and l.expires_at > now()
       and l.acknowledged_at is null
       and a.acknowledged_at is null
       and a.recipient_person_id is not null
       and l.tenant_id = public.public_tenant_id()
     for update of a, l;
  else
    select a.id into v_acknowledgement_id
      from public.distribution_acknowledgement_requests l
      join public.distribution_acknowledgements a
        on a.id = l.acknowledgement_id and a.tenant_id = l.tenant_id
     where l.token_hash = p_token_hash
       and l.expires_at > now()
       and l.acknowledged_at is null
       and a.acknowledged_at is null
       and a.recipient_person_id is not null
       and l.tenant_id = public.public_tenant_id();
  end if;

  return v_acknowledgement_id;
end;
$$;

revoke execute on function public.resolve_distribution_acknowledgement_link(text, boolean)
  from public, anon, authenticated;

-- What the page shows about a recorded handout: the recipient's first name,
-- the event and the pieces it recorded. No contact details.
create function public.distribution_acknowledgement_link_view(p_acknowledgement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'kind', 'handout_link',
           'first_name', nullif(split_part(btrim(coalesce(nullif(btrim(p.preferred_name), ''), p.name, '')), ' ', 1), ''),
           'event_name', (
             select e.name
               from public.inventory_movements m
               join public.events e on e.id = m.event_id and e.tenant_id = m.tenant_id
              where m.distribution_acknowledgement_id = a.id
                and m.tenant_id = a.tenant_id
              limit 1
           ),
           'items', coalesce((
             select jsonb_agg(jsonb_build_object('description', i.description, 'size', i.size)
                              order by m.created_at)
               from public.inventory_movements m
               join public.inventory_items i on i.id = m.inventory_item_id and i.tenant_id = m.tenant_id
              where m.distribution_acknowledgement_id = a.id
                and m.tenant_id = a.tenant_id
           ), '[]'::jsonb)
         )
    from public.distribution_acknowledgements a
    left join public.people p on p.id = a.recipient_person_id and p.tenant_id = a.tenant_id
   where a.id = p_acknowledgement_id;
$$;

revoke execute on function public.distribution_acknowledgement_link_view(uuid) from public, anon, authenticated;

-- 20261005200000's lookup, with the handout link between the gear-request
-- link and the handout's QR code.
create or replace function public.get_as_is_acknowledgement(
  p_token_hash text,
  p_ip_address inet
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_acknowledgement_id uuid;
  v_draft_id uuid;
begin
  if not public.check_rate_limit('get_as_is_acknowledgement', p_ip_address, 30, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  v_request_id := public.resolve_gear_request_acknowledgement_token(p_token_hash, false);
  if v_request_id is not null then
    return public.gear_request_acknowledgement_view(v_request_id);
  end if;

  v_acknowledgement_id := public.resolve_distribution_acknowledgement_link(p_token_hash, false);
  if v_acknowledgement_id is not null then
    return public.distribution_acknowledgement_link_view(v_acknowledgement_id);
  end if;

  -- Raises LINK_INVALID when the hash names no open handout either.
  v_draft_id := public.resolve_distribution_acknowledgement_token(p_token_hash, false);
  return public.distribution_acknowledgement_view(v_draft_id)
         || jsonb_build_object('kind', 'handout');
end;
$$;

comment on function public.get_as_is_acknowledgement(text, inet) is
  'The page behind /acknowledge (#1518, #1519): a gear request''s emailed link, a recorded handout''s emailed link, or an open handout''s one-time code. Returns {kind: gear_request | handout_link | handout, first_name, event_name, items: [{description, size}]}. Raises LINK_INVALID for every kind of dead token. Rate-limited per IP.';

create or replace function public.acknowledge_as_is_by_token(
  p_token_hash text,
  p_acknowledged boolean,
  p_typed_name text,
  p_as_is_text text,
  p_ip_address inet
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_acknowledgement_id uuid;
  v_draft_id uuid;
  v_text text;
  v_name text;
  v_request_ids uuid[];
begin
  if not public.check_rate_limit('acknowledge_as_is_by_token', p_ip_address, 10, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  -- for update: the request (or draft, or acknowledgement) is locked, so a
  -- second submit at the same moment waits rather than writing a second one.
  v_request_id := public.resolve_gear_request_acknowledgement_token(p_token_hash, true);
  if v_request_id is null then
    v_acknowledgement_id := public.resolve_distribution_acknowledgement_link(p_token_hash, true);
  end if;
  if v_request_id is null and v_acknowledgement_id is null then
    v_draft_id := public.resolve_distribution_acknowledgement_token(p_token_hash, true);
    perform public.store_distribution_acknowledgement(
      v_draft_id, p_acknowledged, p_typed_name, p_as_is_text, 'own_device'
    );
    return 'handout';
  end if;

  v_text := public.acknowledged_as_is(p_acknowledged, p_as_is_text);
  v_name := left(nullif(btrim(coalesce(p_typed_name, '')), ''), 200);
  if v_name is null then
    raise exception 'NAME_REQUIRED';
  end if;

  if v_acknowledgement_id is not null then
    -- The reason staff gave at the time stays beside it.
    update public.distribution_acknowledgements
       set acknowledged_at = now(),
           as_is_text = v_text,
           typed_name = v_name,
           method = 'emailed_link'
     where id = v_acknowledgement_id;

    update public.distribution_acknowledgement_requests
       set acknowledged_at = now()
     where acknowledgement_id = v_acknowledgement_id
       and token_hash = p_token_hash
    returning gear_request_ids into v_request_ids;

    if cardinality(v_request_ids) > 0 then
      update public.gear_requests g
         set as_is_acknowledged_at = now(),
             as_is_text = v_text,
             as_is_method = 'emailed_link',
             as_is_typed_name = v_name
        from public.distribution_acknowledgements a
       where a.id = v_acknowledgement_id
         and g.tenant_id = a.tenant_id
         and g.id = any(v_request_ids)
         and g.person_id is not null
         and g.as_is_acknowledged_at is null;
    end if;

    return 'handout_link';
  end if;

  update public.gear_requests
     set as_is_acknowledged_at = now(),
         as_is_text = v_text,
         as_is_method = 'emailed_link',
         as_is_typed_name = v_name
   where id = v_request_id;

  update public.gear_request_acknowledgement_requests
     set acknowledged_at = now()
   where request_id = v_request_id
     and token_hash = p_token_hash;

  return 'gear_request';
end;
$$;

comment on function public.acknowledge_as_is_by_token(text, boolean, text, text, inet) is
  'Records the as-is acknowledgement through /acknowledge (#1518, #1519): on the gear request a live emailed link names (method emailed_link), on the recorded handout a live emailed link names (method emailed_link, beside the reason staff gave, and written back to any pre-#1367 request it fulfilled), else on the open handout a one-time code names (method own_device). Returns gear_request, handout_link or handout. Raises LINK_INVALID, AS_IS_REQUIRED, AS_IS_TEXT_REQUIRED or NAME_REQUIRED. Rate-limited per IP.';

-- ---------------------------------------------------------------------------
-- 5. Self-check
-- ---------------------------------------------------------------------------

do $check$
begin
  if has_column_privilege('authenticated', 'public.distribution_acknowledgement_requests', 'token_hash', 'SELECT')
     or has_column_privilege('anon', 'public.distribution_acknowledgement_requests', 'token_hash', 'SELECT') then
    raise exception 'distribution_acknowledgement_requests.token_hash is readable';
  end if;
  if has_table_privilege('authenticated', 'public.distribution_acknowledgement_requests', 'INSERT')
     or has_table_privilege('authenticated', 'public.distribution_acknowledgement_requests', 'UPDATE') then
    raise exception 'distribution_acknowledgement_requests is writable by authenticated';
  end if;
end;
$check$;
