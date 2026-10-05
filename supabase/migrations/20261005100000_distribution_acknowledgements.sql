-- In-person handouts: a checkout with the recipient's own as-is acknowledgement (#1519)
-- ---------------------------------------------------------------------------
--
-- #1367 took the as-is acknowledgement on the public gear request and left
-- gear handed out in person -- at an event, or by scanning tags onto a
-- handout (#1420, #1443) -- with nothing, because a box in the portal would
-- be staff attesting on the recipient's behalf. That is still true, so this
-- does not add a box for staff. It reopens the gap with the RECIPIENT acting:
--
--   1. The handout is built as before, on the server-side draft.
--   2. Every piece carrying a numbered code (#1444) is ticked off as having
--      had its tag removed. Recording frees the code, so the physical tag has
--      to come off before the item leaves; the RPC refuses a handout whose
--      ticks do not cover every code on it.
--   3. The recipient acknowledges, on their own phone through a one-time QR
--      code (a token on the draft, never on an item -- an item tag still only
--      ever opens the staff resolver), or on the staff device handed to them.
--      Where neither happens, staff may record only with a reason.
--   4. record_distribution_draft() writes one distribution_acknowledgements
--      row and points every movement it records at it.
--
-- THE PENDING ACKNOWLEDGEMENT LIVES ON THE DRAFT, AND STAFF CANNOT WRITE IT.
-- The draft tables are owner-only under RLS and the owner is the staffer, so a
-- plain update grant would let the staffer set "acknowledged" themselves --
-- the attestation #1367 refused. The new columns are therefore outside the
-- insert and update grants, the token hash is outside the select grant as
-- well (the public functions accept a hash, which makes the hash as good as
-- the QR code -- #1502's reasoning), and only the security definer functions
-- below write them.
--
-- THE TOKEN, as with #1049 and #1502: 32 random bytes minted by the Server
-- Action, which stores only their SHA-256 here and puts the raw token in the
-- QR code. Showing the code again mints a new token, which supersedes the
-- last. It works while the draft is open, for two hours, until it is used,
-- and never after the recipient changes. Adding items after the
-- acknowledgement does not invalidate it: it covers the handout, and the
-- record lists what was actually recorded.
--
-- RETENTION, as #1367 treated gear_requests.as_is_*: when, what was shown and
-- how survive anonymization -- a fact about an act and the organization's own
-- words. The typed name is personal data and goes with the recipient link, on
-- the gear-request clock (rule E3 of the purge, below).

-- ---------------------------------------------------------------------------
-- 1. How a gear request's acknowledgement was taken
-- ---------------------------------------------------------------------------

-- #1518 adds the emailed link; this adds the third road, a meetup request
-- that predates #1367 acknowledged in person at its handout.
alter table public.gear_requests
  add column as_is_method text
    constraint gear_requests_as_is_method_check
      check (as_is_method in ('request_form', 'emailed_link', 'in_person')),
  add constraint gear_requests_as_is_method_recorded
    check ((as_is_method is null) = (as_is_acknowledged_at is null));

comment on column public.gear_requests.as_is_method is
  'How the as-is acknowledgement was taken: request_form (the public request, #1367), emailed_link (#1518) or in_person (at a scanned handout, #1519). Null exactly when as_is_acknowledged_at is.';

-- create_gear_request() writes the acknowledgement and knows nothing of this
-- column; a request acknowledged on insert was acknowledged on the form.
create function public.default_gear_request_as_is_method()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.as_is_acknowledged_at is not null and new.as_is_method is null then
    new.as_is_method := 'request_form';
  end if;
  return new;
end;
$$;

revoke execute on function public.default_gear_request_as_is_method() from public, anon, authenticated;

create trigger default_gear_request_as_is_method
  before insert on public.gear_requests
  for each row execute function public.default_gear_request_as_is_method();

update public.gear_requests
   set as_is_method = 'request_form'
 where as_is_acknowledged_at is not null
   and as_is_method is null;

-- ---------------------------------------------------------------------------
-- 2. The acknowledgement a handout recorded
-- ---------------------------------------------------------------------------

create table public.distribution_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  created_at timestamptz not null default now(),
  -- Who the handout was for. Retention clears it with the typed name.
  recipient_person_id uuid,
  -- The staffer running the checkout.
  present_staff uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  -- The words shown, resolved server-side (src/lib/gear-as-is.ts), never sent
  -- by the browser.
  as_is_text text,
  -- Personal data: cleared by the purge with the recipient link.
  typed_name text,
  method text
    constraint distribution_acknowledgements_method_check
      check (method in ('own_device', 'staff_device', 'emailed_link')),
  skipped_reason text
    constraint distribution_acknowledgements_skipped_reason_check
      check (skipped_reason in ('left_before_acknowledging', 'no_phone', 'declined_to_wait', 'other')),
  skipped_note text,
  unique (tenant_id, id),
  -- Either the recipient acknowledged, or staff said why not -- never both,
  -- never neither.
  constraint distribution_acknowledgements_acknowledged_or_skipped check (
    (acknowledged_at is not null and as_is_text is not null and method is not null and skipped_reason is null)
    or (acknowledged_at is null and as_is_text is null and method is null and skipped_reason is not null)
  ),
  constraint distribution_acknowledgements_recipient_in_tenant
    foreign key (tenant_id, recipient_person_id)
    references public.people (tenant_id, id) on delete set null (recipient_person_id)
);

create index distribution_acknowledgements_recipient_idx
  on public.distribution_acknowledgements (tenant_id, recipient_person_id)
  where recipient_person_id is not null;

comment on table public.distribution_acknowledgements is
  'The as-is acknowledgement taken from the recipient at an in-person handout (#1519), or the reason staff recorded it without one. Written only by record_distribution_draft(); every inventory_movements row the handout recorded points here.';

alter table public.distribution_acknowledgements enable row level security;

-- The revoke first, because a hosted project's default privileges hand every
-- new table to both roles (20260911010000, section 4).
revoke all on public.distribution_acknowledgements from public, anon, authenticated;
grant select on public.distribution_acknowledgements to authenticated;

-- Read by whoever reads the item's history.
create policy "distribution_acknowledgements select" on public.distribution_acknowledgements
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('inventory', 'view')
  );

insert into public.audited_tables (table_name, pk_column, redacted_columns) values
  ('distribution_acknowledgements', 'id', '{typed_name}');

create trigger audit_log_row after insert or update or delete
  on public.distribution_acknowledgements
  for each row execute function public.audit_log_row();

-- The person rule anonymizes nobody still referenced through a column missing
-- from this list (20260905090000), so a recipient would otherwise be kept
-- forever by their own acknowledgement.
insert into public.retention_purgeable_person_refs (table_name, column_name) values
  ('distribution_acknowledgements', 'recipient_person_id');

alter table public.inventory_movements
  add column distribution_acknowledgement_id uuid,
  add constraint inventory_movements_distribution_acknowledgement_in_tenant
    foreign key (tenant_id, distribution_acknowledgement_id)
    references public.distribution_acknowledgements (tenant_id, id)
    on delete set null (distribution_acknowledgement_id);

create index inventory_movements_distribution_acknowledgement_idx
  on public.inventory_movements (tenant_id, distribution_acknowledgement_id)
  where distribution_acknowledgement_id is not null;

comment on column public.inventory_movements.distribution_acknowledgement_id is
  'The acknowledgement (or the reason there is none) taken at the in-person handout that recorded this movement (#1519).';

-- ---------------------------------------------------------------------------
-- 3. The pending acknowledgement, on the draft
-- ---------------------------------------------------------------------------

alter table public.inventory_distribution_drafts
  -- SHA-256 of the token in the QR code, hex. Never the token itself.
  add column ack_token_hash text
    constraint inventory_distribution_drafts_ack_token_hash_check
      check (ack_token_hash ~ '^[0-9a-f]{64}$'),
  add column ack_token_expires_at timestamptz,
  add column ack_acknowledged_at timestamptz,
  add column ack_as_is_text text,
  add column ack_typed_name text,
  add column ack_method text
    constraint inventory_distribution_drafts_ack_method_check
      check (ack_method in ('own_device', 'staff_device')),
  add constraint inventory_distribution_drafts_ack_token_hash_key unique (ack_token_hash),
  add constraint inventory_distribution_drafts_ack_complete check (
    (ack_acknowledged_at is null and ack_as_is_text is null and ack_typed_name is null and ack_method is null)
    or (ack_acknowledged_at is not null and ack_as_is_text is not null and ack_typed_name is not null and ack_method is not null)
  );

comment on column public.inventory_distribution_drafts.ack_token_hash is
  'The one-time QR code for this handout (#1519): SHA-256 of the token, withheld from the select grant. Cleared when used or when the recipient changes.';
comment on column public.inventory_distribution_drafts.ack_acknowledged_at is
  'When the recipient acknowledged the handout as-is (#1519), before it was recorded. Written only by the acknowledgement functions; cleared when the recipient changes.';

-- The owner keeps every right they had over the columns they had; the new
-- ones are the definer functions' alone.
revoke select, insert, update on public.inventory_distribution_drafts from authenticated;
grant select (
  id, tenant_id, user_id, event_id, created_at, updated_at, updated_by, recipient_person_id,
  ack_token_expires_at, ack_acknowledged_at, ack_as_is_text, ack_typed_name, ack_method
) on public.inventory_distribution_drafts to authenticated;
grant insert (event_id, recipient_person_id)
  on public.inventory_distribution_drafts to authenticated;
grant update (event_id, recipient_person_id, updated_at, updated_by)
  on public.inventory_distribution_drafts to authenticated;

-- An acknowledgement is the recipient's, so a different recipient voids it,
-- and a token shown to one person must not be usable by the next. A trigger
-- rather than a line in each function, because the recipient changes through
-- three of them and a plain update.
create function public.clear_distribution_draft_acknowledgement()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.recipient_person_id is distinct from old.recipient_person_id then
    new.ack_token_hash := null;
    new.ack_token_expires_at := null;
    new.ack_acknowledged_at := null;
    new.ack_as_is_text := null;
    new.ack_typed_name := null;
    new.ack_method := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_distribution_draft_acknowledgement() from public, anon, authenticated;

create trigger clear_distribution_draft_acknowledgement
  before update on public.inventory_distribution_drafts
  for each row execute function public.clear_distribution_draft_acknowledgement();

-- move_distribution_draft() from 20260927150000 read the whole row into a
-- %rowtype, which now names the withheld token column. The same body, reading
-- only what it uses. Moving a list to an event with none re-keys it and keeps
-- its acknowledgement; merging it into another list keeps the target's, and
-- the trigger above voids that if the merge changes the recipient.
create or replace function public.move_distribution_draft(
  p_from_event_id uuid default null,
  p_to_event_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_from_id uuid;
  v_from_recipient_id uuid;
  v_to_id uuid;
begin
  select id, recipient_person_id into v_from_id, v_from_recipient_id
    from public.inventory_distribution_drafts
   where user_id = auth.uid()
     and event_id is not distinct from p_from_event_id;

  if v_from_id is null then
    return null;
  end if;
  if p_from_event_id is not distinct from p_to_event_id then
    return v_from_id;
  end if;

  select id into v_to_id
    from public.inventory_distribution_drafts
   where user_id = auth.uid()
     and event_id is not distinct from p_to_event_id;

  if v_to_id is null then
    update public.inventory_distribution_drafts
       set event_id = p_to_event_id
     where id = v_from_id;
    return v_from_id;
  end if;

  insert into public.inventory_distribution_draft_items (draft_id, item_id, created_at)
  select v_to_id, item_id, created_at
    from public.inventory_distribution_draft_items
   where draft_id = v_from_id
  on conflict (tenant_id, draft_id, item_id) do nothing;

  update public.inventory_distribution_drafts
     set recipient_person_id = coalesce(v_from_recipient_id, recipient_person_id),
         updated_at = now()
   where id = v_to_id;

  delete from public.inventory_distribution_drafts where id = v_from_id;
  return v_to_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Whether a handout needs one: meetup requests
-- ---------------------------------------------------------------------------

-- The gear request each piece on the draft is held under for this recipient:
-- its latest hold, when the piece is still reserved and the hold is the
-- recipient's. A piece not held, or held for someone else, has none.
create function public.distribution_draft_holds(p_draft_id uuid)
returns table (item_id uuid, gear_request_id uuid, as_is_acknowledged_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select di.item_id, g.id, g.as_is_acknowledged_at
    from public.inventory_distribution_draft_items di
    join public.inventory_distribution_drafts d
      on d.id = di.draft_id and d.tenant_id = di.tenant_id
    join public.inventory_items i
      on i.id = di.item_id and i.tenant_id = di.tenant_id
    left join lateral (
      select m.gear_request_id, m.recipient_person_id
        from public.inventory_movements m
       where m.tenant_id = di.tenant_id
         and m.inventory_item_id = di.item_id
         and m.movement_type = 'reserved'
       order by m.occurred_at desc, m.created_at desc
       limit 1
    ) hold on i.status = 'reserved'
    left join public.gear_requests g
      on g.id = hold.gear_request_id
     and g.tenant_id = di.tenant_id
     and hold.recipient_person_id = d.recipient_person_id
   where di.draft_id = p_draft_id;
$$;

revoke execute on function public.distribution_draft_holds(uuid) from public, anon, authenticated;

-- A handout every piece of which is held under a request that already carries
-- the acknowledgement skips step 3: the recipient gave it when they asked.
create function public.distribution_draft_needs_acknowledgement(p_draft_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.inventory_distribution_draft_items where draft_id = p_draft_id)
      or exists (
        select 1 from public.distribution_draft_holds(p_draft_id) h
         where h.as_is_acknowledged_at is null
      );
$$;

revoke execute on function public.distribution_draft_needs_acknowledgement(uuid) from public, anon, authenticated;

-- The checkout's question, for the caller's own draft.
create function public.distribution_draft_checkout(p_event_id uuid default null)
returns table (needs_acknowledgement boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_draft_id uuid;
begin
  if not (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a distribution';
  end if;

  select id into v_draft_id
    from public.inventory_distribution_drafts
   where tenant_id = public.current_tenant_id()
     and user_id = auth.uid()
     and event_id is not distinct from p_event_id;

  if v_draft_id is null then
    raise exception 'DRAFT_EMPTY';
  end if;

  return query select public.distribution_draft_needs_acknowledgement(v_draft_id);
end;
$$;

comment on function public.distribution_draft_checkout(uuid) is
  'Whether the caller''s handout for this event (or none) needs the recipient''s as-is acknowledgement (#1519): false only when every piece is held for the recipient under a gear request that already carries one.';

revoke execute on function public.distribution_draft_checkout(uuid) from public, anon;
grant execute on function public.distribution_draft_checkout(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The one-time QR code
-- ---------------------------------------------------------------------------

create function public.issue_distribution_acknowledgement_token(
  p_event_id uuid,
  p_token_hash text
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.inventory_distribution_drafts%rowtype;
  v_expires_at timestamptz := now() + interval '2 hours';
begin
  if not (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a distribution';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'TOKEN_INVALID';
  end if;

  select * into v_draft
    from public.inventory_distribution_drafts
   where tenant_id = public.current_tenant_id()
     and user_id = auth.uid()
     and event_id is not distinct from p_event_id
   for update;

  if v_draft.id is null then
    raise exception 'DRAFT_EMPTY';
  end if;
  if v_draft.ack_acknowledged_at is not null then
    raise exception 'ALREADY_ACKNOWLEDGED';
  end if;

  update public.inventory_distribution_drafts
     set ack_token_hash = p_token_hash,
         ack_token_expires_at = v_expires_at
   where id = v_draft.id;

  return v_expires_at;
end;
$$;

comment on function public.issue_distribution_acknowledgement_token(uuid, text) is
  'Stores the hash of a freshly minted one-time token for the caller''s handout (#1519), superseding any earlier one, and returns when it expires. Raises DRAFT_EMPTY, ALREADY_ACKNOWLEDGED or TOKEN_INVALID.';

revoke execute on function public.issue_distribution_acknowledgement_token(uuid, text) from public, anon;
grant execute on function public.issue_distribution_acknowledgement_token(uuid, text) to authenticated;

-- The draft a token names on this tenant's public site, or LINK_INVALID --
-- unknown, expired, used, superseded, voided by a recipient change and
-- another tenant's all alike.
create function public.resolve_distribution_acknowledgement_token(
  p_token_hash text,
  p_for_update boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'LINK_INVALID';
  end if;

  if p_for_update then
    select d.id into v_draft_id
      from public.inventory_distribution_drafts d
     where d.ack_token_hash = p_token_hash
       and d.ack_token_expires_at > now()
       and d.ack_acknowledged_at is null
       and d.tenant_id = public.public_tenant_id()
     for update;
  else
    select d.id into v_draft_id
      from public.inventory_distribution_drafts d
     where d.ack_token_hash = p_token_hash
       and d.ack_token_expires_at > now()
       and d.ack_acknowledged_at is null
       and d.tenant_id = public.public_tenant_id();
  end if;

  if v_draft_id is null then
    raise exception 'LINK_INVALID';
  end if;
  return v_draft_id;
end;
$$;

revoke execute on function public.resolve_distribution_acknowledgement_token(text, boolean)
  from public, anon, authenticated;

-- What the recipient's phone shows: the recipient's first name, the event and
-- the pieces. No contact details, so a photographed QR code gives away almost
-- nothing. Callable by anon -- the recipient has no account -- and
-- rate-limited per IP like #1502's link.
create function public.get_distribution_acknowledgement(
  p_token_hash text,
  p_ip_address inet
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft_id uuid;
begin
  if not public.check_rate_limit('get_distribution_acknowledgement', p_ip_address, 30, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  v_draft_id := public.resolve_distribution_acknowledgement_token(p_token_hash, false);
  return public.distribution_acknowledgement_view(v_draft_id);
end;
$$;

comment on function public.get_distribution_acknowledgement(text, inet) is
  'The public page behind a handout''s one-time QR code (#1519): {first_name, event_name, items: [{description, size}]}. Raises LINK_INVALID for every kind of dead token. Rate-limited per IP.';

-- Shared by the public page and the staff-device page, so both show the same.
create function public.distribution_acknowledgement_view(p_draft_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'first_name', nullif(split_part(btrim(coalesce(p.name, '')), ' ', 1), ''),
           'event_name', e.name,
           'items', coalesce((
             select jsonb_agg(jsonb_build_object('description', i.description, 'size', i.size)
                              order by di.created_at)
               from public.inventory_distribution_draft_items di
               join public.inventory_items i on i.id = di.item_id and i.tenant_id = di.tenant_id
              where di.draft_id = d.id
           ), '[]'::jsonb)
         )
    from public.inventory_distribution_drafts d
    left join public.people p on p.id = d.recipient_person_id and p.tenant_id = d.tenant_id
    left join public.events e on e.id = d.event_id and e.tenant_id = d.tenant_id
   where d.id = p_draft_id;
$$;

revoke execute on function public.distribution_acknowledgement_view(uuid) from public, anon, authenticated;

revoke execute on function public.get_distribution_acknowledgement(text, inet) from public;
grant execute on function public.get_distribution_acknowledgement(text, inet) to anon, authenticated;

-- What both ways of acknowledging write. The name is the recipient's, typed
-- by them; the words are the server's.
create function public.store_distribution_acknowledgement(
  p_draft_id uuid,
  p_acknowledged boolean,
  p_typed_name text,
  p_as_is_text text,
  p_method text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := public.acknowledged_as_is(p_acknowledged, p_as_is_text);
  v_name text := left(nullif(btrim(coalesce(p_typed_name, '')), ''), 200);
begin
  if v_name is null then
    raise exception 'NAME_REQUIRED';
  end if;

  update public.inventory_distribution_drafts
     set ack_acknowledged_at = now(),
         ack_as_is_text = v_text,
         ack_typed_name = v_name,
         ack_method = p_method,
         -- One-time: the code stops working once it has been used.
         ack_token_hash = null,
         ack_token_expires_at = null
   where id = p_draft_id;
end;
$$;

revoke execute on function public.store_distribution_acknowledgement(uuid, boolean, text, text, text)
  from public, anon, authenticated;

create function public.acknowledge_distribution_by_token(
  p_token_hash text,
  p_acknowledged boolean,
  p_typed_name text,
  p_as_is_text text,
  p_ip_address inet
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft_id uuid;
begin
  if not public.check_rate_limit('acknowledge_distribution_by_token', p_ip_address, 10, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  v_draft_id := public.resolve_distribution_acknowledgement_token(p_token_hash, true);
  perform public.store_distribution_acknowledgement(
    v_draft_id, p_acknowledged, p_typed_name, p_as_is_text, 'own_device'
  );
end;
$$;

comment on function public.acknowledge_distribution_by_token(text, boolean, text, text, inet) is
  'The recipient acknowledging a handout as-is on their own phone (#1519). p_as_is_text is resolved by the server from src/lib/gear-as-is.ts, never by the browser. Raises LINK_INVALID, AS_IS_REQUIRED, AS_IS_TEXT_REQUIRED or NAME_REQUIRED. Rate-limited per IP.';

revoke execute on function public.acknowledge_distribution_by_token(text, boolean, text, text, inet) from public;
grant execute on function public.acknowledge_distribution_by_token(text, boolean, text, text, inet) to anon, authenticated;

-- "Hand them this device": the same page, full-screen on the staffer's own
-- session, and recorded as such.
create function public.get_distribution_acknowledgement_on_staff_device(p_event_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_draft_id uuid;
begin
  if not (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a distribution';
  end if;

  select id into v_draft_id
    from public.inventory_distribution_drafts
   where tenant_id = public.current_tenant_id()
     and user_id = auth.uid()
     and event_id is not distinct from p_event_id
     and ack_acknowledged_at is null;

  if v_draft_id is null then
    raise exception 'DRAFT_EMPTY';
  end if;
  return public.distribution_acknowledgement_view(v_draft_id);
end;
$$;

revoke execute on function public.get_distribution_acknowledgement_on_staff_device(uuid) from public, anon;
grant execute on function public.get_distribution_acknowledgement_on_staff_device(uuid) to authenticated;

create function public.acknowledge_distribution_on_staff_device(
  p_event_id uuid,
  p_acknowledged boolean,
  p_typed_name text,
  p_as_is_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft public.inventory_distribution_drafts%rowtype;
begin
  if not (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a distribution';
  end if;

  select * into v_draft
    from public.inventory_distribution_drafts
   where tenant_id = public.current_tenant_id()
     and user_id = auth.uid()
     and event_id is not distinct from p_event_id
   for update;

  if v_draft.id is null then
    raise exception 'DRAFT_EMPTY';
  end if;
  if v_draft.ack_acknowledged_at is not null then
    raise exception 'ALREADY_ACKNOWLEDGED';
  end if;

  perform public.store_distribution_acknowledgement(
    v_draft.id, p_acknowledged, p_typed_name, p_as_is_text, 'staff_device'
  );
end;
$$;

comment on function public.acknowledge_distribution_on_staff_device(uuid, boolean, text, text) is
  'The recipient acknowledging a handout as-is on the staffer''s device, handed to them (#1519). Recorded as staff_device. Raises DRAFT_EMPTY, ALREADY_ACKNOWLEDGED, AS_IS_REQUIRED, AS_IS_TEXT_REQUIRED or NAME_REQUIRED.';

revoke execute on function public.acknowledge_distribution_on_staff_device(uuid, boolean, text, text) from public, anon;
grant execute on function public.acknowledge_distribution_on_staff_device(uuid, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Recording the handout
-- ---------------------------------------------------------------------------

-- Security definer now, because it writes distribution_acknowledgements, which
-- nobody may insert into directly -- otherwise a staffer could write the
-- acknowledgement this exists to take from the recipient. The draft lookup
-- therefore names the tenant and the owner itself, which RLS used to do.
--
-- Three new refusals, before anything is written:
--   TAGS_NOT_REMOVED -- marking the pieces distributed frees their numbered
--     codes, and p_removed_tags does not cover every one on the handout;
--   ACKNOWLEDGEMENT_REQUIRED -- the recipient has not acknowledged, no reason
--     was given, and the handout is not wholly covered by acknowledged
--     requests;
--   SKIP_REASON_INVALID -- an unknown reason, or "other" without a note.
drop function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean);

create function public.record_distribution_draft(
  p_event_id uuid default null,
  p_occurred_at timestamptz default now(),
  p_reason text default null,
  p_recipient_person_id uuid default null,
  p_mark_item_distributed boolean default true,
  p_removed_tags text[] default '{}',
  p_skipped_reason text default null,
  p_skipped_note text default null
)
returns table (recorded integer, released_tags jsonb)
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
begin
  if not (public.has_permission('inventory', 'manage') or public.has_permission('inventory_intake', 'manage')) then
    raise exception 'Not authorized to record a distribution';
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

  delete from public.inventory_distribution_drafts where id = v_draft.id;

  return query
  select cardinality(v_movement_ids),
         coalesce(
           (select jsonb_agg(jsonb_build_object(
                     'item_id', r.item_id, 'description', r.description, 'code', r.code))
              from public.released_numbered_inventory_tags(v_movement_ids) r),
           '[]'::jsonb
         );
end;
$$;

comment on function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean, text[], text, text) is
  'Records the caller''s handout (#1420, #1519): one distributed movement per piece, every one pointing at the distribution_acknowledgements row it writes from the recipient''s acknowledgement or p_skipped_reason. Raises DRAFT_EMPTY, TAGS_NOT_REMOVED (detail: the first code not ticked), ACKNOWLEDGEMENT_REQUIRED, SKIP_REASON_INVALID or ITEM_ALREADY_DISTRIBUTED (detail: the item).';

revoke execute on function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean, text[], text, text) from public, anon;
grant execute on function public.record_distribution_draft(uuid, timestamptz, text, uuid, boolean, text[], text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The item's history shows it
-- ---------------------------------------------------------------------------

-- inventory_item_history from 20260927200000, with five trailing columns on
-- every entry: a distribution's acknowledgement, or why there is none. A
-- handout covered by its gear request reads the request's own, with method
-- 'gear_request'. The return type changes, so it is dropped first.
drop function public.inventory_item_history(uuid);

create function public.inventory_item_history(p_item_id uuid)
returns table (
  entry_kind text,
  entry_id uuid,
  occurred_at timestamptz,
  donated_on date,
  movement_type text,
  quantity integer,
  reason text,
  notes text,
  event_id uuid,
  event_name text,
  donation_id uuid,
  donor_id uuid,
  donor_name text,
  donor_is_anonymous boolean,
  donor_source_type text,
  intake_route text,
  recipient_id uuid,
  recipient_name text,
  gear_request_id uuid,
  recorded_by uuid,
  as_is_acknowledged_at timestamptz,
  as_is_typed_name text,
  as_is_method text,
  as_is_skipped_reason text,
  as_is_skipped_note text,
  recorded_by_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  with item as (
    select i.id, i.donation_id, i.created_at, i.created_by
      from public.inventory_items i
     where i.id = p_item_id
  ),
  intake as (
    select m.id, m.occurred_at, m.reason, m.event_id, m.created_by
      from public.inventory_movements m
      join item on m.inventory_item_id = item.id
     where m.movement_type = 'received'
     order by m.occurred_at, m.created_at, m.id
     limit 1
  ),
  entries as (
    select
      'donated'::text as entry_kind,
      item.donation_id as entry_id,
      coalesce(intake.occurred_at, item.created_at) as occurred_at,
      d.donated_at as donated_on,
      null::text as movement_type,
      null::integer as quantity,
      null::text as reason,
      d.notes,
      e.id as event_id,
      e.name as event_name,
      d.id as donation_id,
      p.id as donor_id,
      p.name as donor_name,
      p.is_anonymous as donor_is_anonymous,
      p.source_type as donor_source_type,
      case intake.reason
        when 'Donation intake' then 'intake_form'
        when 'Sponsor contribution' then 'event_sponsor'
      end as intake_route,
      null::uuid as recipient_id,
      null::text as recipient_name,
      null::uuid as gear_request_id,
      coalesce(d.created_by, intake.created_by, item.created_by) as recorded_by,
      null::timestamptz as as_is_acknowledged_at,
      null::text as as_is_typed_name,
      null::text as as_is_method,
      null::text as as_is_skipped_reason,
      null::text as as_is_skipped_note
    from item
    left join intake on true
    left join public.donations d on d.id = item.donation_id
    left join public.people p on p.id = d.donor_id
    left join public.events e on e.id = coalesce(d.event_id, intake.event_id)

    union all

    select
      'movement',
      m.id,
      m.occurred_at,
      null,
      m.movement_type,
      m.quantity,
      m.reason,
      m.notes,
      e.id,
      e.name,
      null,
      null,
      null,
      null,
      null,
      null,
      r.id,
      r.name,
      g.id,
      m.created_by,
      coalesce(a.acknowledged_at, held.as_is_acknowledged_at),
      a.typed_name,
      coalesce(a.method, case when held.as_is_acknowledged_at is not null then 'gear_request' end),
      a.skipped_reason,
      a.skipped_note
    from public.inventory_movements m
    join item on m.inventory_item_id = item.id
    left join public.events e on e.id = m.event_id
    left join public.people r on r.id = m.recipient_person_id
    left join public.gear_requests g on g.id = m.gear_request_id
    left join public.distribution_acknowledgements a on a.id = m.distribution_acknowledgement_id
    -- A handout with no acknowledgement of its own that fulfilled a request
    -- carrying one (#1519, step 3 skipped).
    left join lateral (
      select hg.as_is_acknowledged_at
        from public.inventory_movements hm
        join public.gear_requests hg on hg.id = hm.gear_request_id
       where hm.inventory_item_id = m.inventory_item_id
         and hm.movement_type = 'reserved'
         and hm.occurred_at <= m.occurred_at
       order by hm.occurred_at desc, hm.created_at desc
       limit 1
    ) held on m.movement_type = 'distributed' and m.distribution_acknowledgement_id is null
    where m.id is distinct from (select intake.id from intake)

    union all

    select
      'tag_assigned', a.id, a.assigned_at, null, null, null, t.value, null,
      null, null, null, null, null, null, null, null, null, null, null,
      a.assigned_by, null, null, null, null, null
    from public.inventory_item_tag_assignments a
    join item on a.item_id = item.id
    join public.inventory_item_tags t on t.id = a.tag_id

    union all

    select
      'tag_released', a.id, a.released_at, null, null, null, t.value,
      a.release_reason,
      null, null, null, null, null, null, null, null, null, null, null,
      a.released_by, null, null, null, null, null
    from public.inventory_item_tag_assignments a
    join item on a.item_id = item.id
    join public.inventory_item_tags t on t.id = a.tag_id
    where a.released_at is not null
  )
  select entries.*, public.inventory_actor_name(entries.recorded_by)
    from entries
   order by (entries.entry_kind = 'donated'), entries.occurred_at desc,
     entries.entry_id;
$$;

revoke execute on function public.inventory_item_history(uuid) from public, anon;
grant execute on function public.inventory_item_history(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Self-check
-- ---------------------------------------------------------------------------

do $check$
declare
  v_policies text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into v_policies
    from pg_policies
   where schemaname = 'public'
     and tablename = 'distribution_acknowledgements'
     and coalesce(qual, '') || coalesce(with_check, '') not like '%current_tenant_id()%';

  if v_policies is not null then
    raise exception 'distribution_acknowledgements policies without the tenant predicate: %', v_policies;
  end if;

  if has_column_privilege('authenticated', 'public.inventory_distribution_drafts', 'ack_acknowledged_at', 'UPDATE')
     or has_column_privilege('authenticated', 'public.inventory_distribution_drafts', 'ack_token_hash', 'SELECT') then
    raise exception 'the pending acknowledgement on inventory_distribution_drafts is writable or its token readable by authenticated';
  end if;
end;
$check$;

-- ---------------------------------------------------------------------------
-- 9. Retention: the typed name goes with the recipient link
-- ---------------------------------------------------------------------------

-- run_retention_purge(): the live body from 20261001100000 with one new block
-- after E2 (search for "E3."). Everything else is unchanged. Re-emitted in
-- full because the function is one plpgsql block; the signature is unchanged,
-- so `create or replace` is enough and the pg_cron entry keeps resolving.

CREATE OR REPLACE FUNCTION public.run_retention_purge(p_dry_run boolean DEFAULT true, p_as_of timestamp with time zone DEFAULT now(), p_trigger text DEFAULT 'cron'::text, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid;
  v_run_id uuid;
  v_result_run_id uuid;
  v_ids uuid[];
  v_person_ids uuid[];
  v_failed boolean := false;
  v_period interval;
  v_secondary interval;
  v_mode text;
  v_enforce boolean;
  -- Rule N's three values, computed once above the loop and logged inside it.
  v_account_ids uuid[] := '{}';
  v_account_enforce boolean := false;
  v_account_error text;
begin
  -- A manual dry run from the portal must not interleave with the nightly job.
  -- Transaction-scoped, so it releases on commit or rollback either way.
  if not pg_try_advisory_xact_lock(hashtext('retention_purge')) then
    return null;
  end if;

  -- Rule H, once for the sweep rather than once per tenant. rate_limit_hits is
  -- keyed by IP and route and has no tenant_id, so there is nothing to scope --
  -- but its policy row is per-tenant now, and purge_rate_limit_hits() takes the
  -- strictest clock any tenant has set. Each tenant's run still logs the rule,
  -- inside the loop, so the Data Retention page explains it as before.
  if not p_dry_run then
    perform public.purge_rate_limit_hits(p_as_of);
  end if;

  -- N, part one (#1296). Website accounts, decided and applied once for the
  -- whole platform rather than once per tenant.
  --
  -- The second rule with nothing to scope, for a stronger reason than rule H's:
  -- an account has no tenant until a claim is approved. Somebody signs up at
  -- /my against whichever host they were on and nothing records which --
  -- deliberately, because #1161 resolves a constituent's tenant from the
  -- request rather than from a membership. There is no tenant whose sweep owns
  -- the row.
  --
  -- Two consequences, both the conservative direction:
  --
  --   * the clock is the SHORTEST any tenant has set, as rule H's is. An
  --     account belongs to a person rather than to an organization, so no
  --     tenant's choice may extend how long another's sign-up is held.
  --   * it enforces only where EVERY active tenant has the rule enforcing. One
  --     organization that has not agreed to the period is a veto, because the
  --     row it would remove is as much the next organization's as its own. A
  --     tenant with no row at all reads as 'off' and vetoes too.
  --
  -- The candidate list is read whatever the modes say, so a dry run reports
  -- real counts. It is read here rather than after the loop, so rules L and M
  -- below have not yet dropped this run's expired claims: an account those
  -- deletions free is deleted by the next night's run, not this one. The same
  -- conservatism rule D2 records, and for the same reason -- reporting the
  -- accounts that are already free is checkable, and simulating the ones a
  -- later rule in the same run would free is not.
  --
  -- In its own exception block, unlike rule H's call, which is bare: this one
  -- deletes from auth.users, where a reference the walk cannot see (an
  -- extension's table, storage.objects.owner) raises 23503. The sweep has to
  -- survive that and report it, which is what v_account_error carries into
  -- every tenant's run below.
  begin
    select min(period) into v_period
      from public.retention_policies where policy_key = 'constituent_accounts';

    if v_period is not null then
      v_account_ids := public.retention_unclaimed_account_ids(p_as_of - v_period);

      v_account_enforce := not p_dry_run and not exists (
        select 1
          from public.tenants t
          left join public.retention_policies p
            on p.tenant_id = t.id and p.policy_key = 'constituent_accounts'
         where t.status = 'active'
           and coalesce(p.mode, 'off') <> 'enforce'
      );

      if v_account_enforce and array_length(v_account_ids, 1) is not null then
        delete from auth.users where id = any(v_account_ids);
      end if;
    end if;
  exception when others then
    v_account_error := sqlerrm;
    v_account_ids := '{}';
  end;

  for v_tenant in
    select t.id
      from public.tenants t
     where t.status = 'active'
       and (p_tenant_id is null or t.id = p_tenant_id)
     order by t.created_at
  loop
    v_failed := false;

    insert into public.retention_runs (tenant_id, as_of, dry_run, trigger, triggered_by, status)
    values (v_tenant, p_as_of, p_dry_run, p_trigger, auth.uid(), 'running')
    returning id into v_run_id;

    if v_tenant = p_tenant_id then
      v_result_run_id := v_run_id;
    end if;

    -- Each rule gets its own exception block. A plpgsql exception block is a
    -- subtransaction, so a rule that fails rolls back only itself and the run
    -- finishes as 'partial' with the error recorded against that rule -- rather
    -- than one bad clock discarding the work of the other eight.

    -- H. Abuse-protection records. Not mode-gated; see purge_rate_limit_hits.
    --
    -- The only rule with no tenant dimension: rate_limit_hits is keyed by IP and
    -- route, has no tenant_id, and is correctly global (20260906010000 lists it
    -- among the twelve tables that stay platform-wide). The sweep therefore runs
    -- the purge once, above the loop, and each tenant's run logs the rule so the
    -- page still explains it rather than appearing to have skipped it.
    begin
      perform public.retention_log(v_run_id, 'rate_limit_hits', 'rate_limit_hits',
        case when p_dry_run then 'skipped' else 'deleted' end, '{}');
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rate_limit_hits', 'rate_limit_hits', 'skipped', sqlerrm);
    end;

    -- A. Contact form messages. The one table here that is safe to delete
    -- outright: nothing has a foreign key to it and it carries no audit trigger.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'contact_messages' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'skipped', '{}');
      else
        v_ids := array(
          select id from public.contact_messages
           where tenant_id = v_tenant and created_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'contact_messages', 'contact_messages', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.contact_messages where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'contact_messages', 'contact_messages', 'skipped', sqlerrm);
    end;

    -- C. Event registrations: strip the person, keep the row.
    --
    -- name and email are NOT NULL (20260823090000), so they take sentinels rather
    -- than nulls. '' is the established "no email" value -- both unique indexes
    -- here are partial (WHERE email <> '', WHERE person_id IS NOT NULL, see
    -- 20260901010000), which is exactly what makes anonymizing many rows of one
    -- event safe. party_size, checked_in_at, the three *_at_event snapshot
    -- columns, the waiver pair and party_includes_minor survive untouched: they
    -- are the impact figures and the acts this rule exists to preserve.
    --
    -- The four accompanying-adult and emergency contacts go with the personal
    -- fields (#685). One of them is the only personal data this product holds
    -- about somebody who never visited the site, and holding an emergency
    -- contact's number three years after the event is over describes nothing.
    -- They join the selector as well as the update: a row whose only remaining
    -- personal data was an emergency contact would otherwise never be picked up
    -- again. The column constraint is one-directional for exactly this update --
    -- the flag stays true while the contacts go null, which it allows.
    --
    -- The three photo-consent columns go with them (#599), and that is the
    -- OPPOSITE call from the waiver pair two paragraphs up. Both are records of
    -- something somebody said, so the difference is what they are about. An
    -- acceptance is a fact about an ACT -- this person agreed to these terms on
    -- this date -- and it stands on its own; #686 kept it for that reason. Photo
    -- consent is a fact about a person's FACE, and it is worthless the moment
    -- the row cannot be tied to one: an anonymized "declined" protects nobody,
    -- because there is no name to match against a photograph, and an anonymized
    -- "granted" authorizes nothing. So all three go beside the name, the email
    -- and the person_id, and `photo_consent is not null` joins the selector for
    -- the same reason the contacts do.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'event_registrations' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'skipped', '{}');
      else
        v_ids := array(
          select r.id
            from public.event_registrations r
            join public.events e on e.id = r.event_id
           where r.tenant_id = v_tenant
             and coalesce(e.ends_at, e.starts_at) < p_as_of - v_period
             and (r.name <> 'Removed' or r.person_id is not null
                  or r.phone is not null or r.notes is not null
                  or r.instagram_handle is not null or r.pronouns is not null
                  or r.accompanying_adult_name is not null
                  or r.accompanying_adult_phone is not null
                  or r.emergency_contact_name is not null
                  or r.emergency_contact_phone is not null
                  or r.photo_consent is not null
                  -- #1501
                  or exists (select 1 from public.event_registration_answers a
                              where a.registration_id = r.id))
        );
        perform public.retention_log(v_run_id, 'event_registrations', 'event_registrations', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.event_registrations
             set name = 'Removed',
                 email = '',
                 phone = null,
                 notes = null,
                 -- #1418. A staff note on a cancellation can name somebody.
                 cancellation_note = null,
                 instagram_handle = null,
                 pronouns = null,
                 person_id = null,
                 accompanying_adult_name = null,
                 accompanying_adult_phone = null,
                 emergency_contact_name = null,
                 emergency_contact_phone = null,
                 photo_consent = null,
                 photo_consent_at = null,
                 photo_consent_text = null
           where id = any(v_ids);
          -- #1501. The answers go with the name.
          delete from public.event_registration_answers
           where registration_id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'event_registrations', 'event_registrations', 'skipped', sqlerrm);
    end;

    -- B. Volunteer applications. Two clocks: the published policy is "2 years
    -- after your last activity with us, or 1 year if the application is withdrawn
    -- or declined". There is no 'withdrawn' status in the check constraint
    -- (20260827000000) -- 'declined' and 'closed' are the states that mean it,
    -- and status is what selects the clock.
    --
    -- The main clock reads person_last_activity_at, not just the row's
    -- updated_at, so a 'placed' application belonging to a volunteer who is still
    -- turning up does not expire merely because nobody has edited the record.
    begin
      select period, secondary_period, mode into v_period, v_secondary, v_mode
        from public.retention_policies
         where policy_key = 'volunteer_applications' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.volunteer_applications a
           where a.tenant_id = v_tenant
             and case
                   when a.status in ('declined', 'closed')
                     then a.updated_at < p_as_of - v_secondary
                   else greatest(a.updated_at,
                                 public.person_last_activity_at(a.person_id))
                          < p_as_of - v_period
                 end
        );
        perform public.retention_log(v_run_id, 'volunteer_applications', 'volunteer_applications', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.volunteer_applications where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'volunteer_applications', 'volunteer_applications', 'skipped', sqlerrm);
    end;

    -- E. Gear requests. The movement row is inventory history and stays; only the
    -- requester goes -- the link, and now the free text they wrote on the request
    -- form, which #721 moved off people.notes and onto the movement. Their name,
    -- email and phone are still not on the movement -- request_gear_items() puts
    -- those on a people row via resolve_or_create_person_by_email() -- so
    -- unlinking here is what lets the person rule below reach them.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'gear_requests' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.inventory_movements m
           where m.tenant_id = v_tenant
             and m.recipient_person_id is not null
             and m.movement_type in ('reserved', 'distributed')
             and m.occurred_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'gear_requests', 'inventory_movements', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.inventory_movements set recipient_person_id = null, notes = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'gear_requests', 'inventory_movements', 'skipped', sqlerrm);
    end;

    -- E2. Gear request headers (#1032). The delivery method, the postage quote
    -- and the status are inventory history and stay; the requester link, the
    -- shipping address, the payment preference and the request notes go on the
    -- same clock as the movements above. Measured from the handover -- the
    -- fulfilment, else the cancellation, else the request itself.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'gear_requests' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'gear_requests', 'gear_requests', 'skipped', '{}');
      else
        v_ids := array(
          select r.id
            from public.gear_requests r
           where r.tenant_id = v_tenant
             and (r.person_id is not null
                  or r.ship_line1 is not null
                  or r.payment_method is not null
                  or r.notes is not null)
             and coalesce(r.fulfilled_at, r.cancelled_at, r.created_at) < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'gear_requests', 'gear_requests', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.gear_requests
             set person_id = null,
                 ship_name = null,
                 ship_line1 = null,
                 ship_line2 = null,
                 ship_city = null,
                 ship_region = null,
                 ship_postal_code = null,
                 ship_country = null,
                 payment_method = null,
                 notes = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'gear_requests', 'gear_requests', 'skipped', sqlerrm);
    end;

    -- E3. In-person handout acknowledgements (#1519). When, what was shown and
    -- how stay -- a fact about an act and the organization's own words, as
    -- gear_requests.as_is_* do. The recipient link and the name they typed go,
    -- on the gear-request clock, measured from the handout.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'gear_requests' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'gear_requests', 'distribution_acknowledgements', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.distribution_acknowledgements a
           where a.tenant_id = v_tenant
             and (a.recipient_person_id is not null or a.typed_name is not null)
             and a.created_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'gear_requests', 'distribution_acknowledgements', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.distribution_acknowledgements
             set recipient_person_id = null,
                 typed_name = null
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'gear_requests', 'distribution_acknowledgements', 'skipped', sqlerrm);
    end;


    -- D1. Rider profiles, and the backfill that has to come first.
    --
    -- The impact RPCs read coalesce(registration.*_at_event, the live people row)
    -- (20260904140000), and the snapshot trigger only stamps on the check-in
    -- transition (20260904120000). So any registration checked in before that
    -- migration, or whose person had no profile at the time, still resolves
    -- through people. Clearing the person's rider columns without stamping the
    -- snapshot first would silently change beginner counts on events that closed
    -- years ago. Backfill, then clear, in that order, in one transaction.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'rider_profiles' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
           where p.tenant_id = v_tenant
             and p.riding_discipline is not null
             and public.person_last_activity_at(p.id) < p_as_of - v_period
        );

        v_ids := array(
          select r.id
            from public.event_registrations r
            join public.people p on p.id = r.person_id
           where r.tenant_id = v_tenant
             and r.checked_in_at is not null
             and r.riding_discipline_at_event is null
             and p.riding_discipline is not null
             and p.id = any(v_person_ids)
        );
        perform public.retention_log(v_run_id, 'rider_profiles', 'event_registrations', 'backfilled', v_ids);

        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.event_registrations r
             set riding_discipline_at_event = p.riding_discipline,
                 ski_experience_level_at_event = p.ski_experience_level,
                 snowboard_experience_level_at_event = p.snowboard_experience_level
            from public.people p
           where p.id = r.person_id
             and r.tenant_id = v_tenant
             and r.checked_in_at is not null
             and r.riding_discipline_at_event is null
             and p.riding_discipline is not null
             and p.id = any(v_person_ids);
        end if;

        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'cleared', v_person_ids);

        -- All four columns in one statement: people_ski_level_requires_ski and
        -- people_snowboard_level_requires_snowboard (20260901050000) fire if a
        -- level outlives its discipline, which is why merge_people() handles them
        -- as a group too.
        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.people
             set riding_discipline = null,
                 ski_experience_level = null,
                 snowboard_experience_level = null,
                 preferred_mountain = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
    end;

    -- D2. Anonymize the person, when nothing else needs them.
    --
    -- Runs last of the person rules on purpose: retention_person_is_retained()
    -- has to observe the state after C, B and E dropped their references. In a
    -- dry run those references are still there, so this count is conservative --
    -- it reports the people who are *already* free, not the ones the same run
    -- would free. Say so on the page rather than trying to simulate it.
    --
    -- The row is never deleted. ~40 foreign keys point at people, nearly all
    -- NO ACTION, so a delete would fail for anyone with any history; is_anonymous
    -- is how this schema has always expressed "a person we keep no details for"
    -- (the donor_identified_or_anonymous check permits a null name only then, and
    -- people_email_key excludes anonymized rows from the unique index).
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'rider_profiles' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
           where p.tenant_id = v_tenant
             and p.auth_user_id is null
             and not p.is_anonymous
             and public.person_last_activity_at(p.id) < p_as_of - v_period
             and not public.retention_person_is_retained(p.id)
        );
        perform public.retention_log(v_run_id, 'rider_profiles', 'people', 'anonymized', v_person_ids);
        if v_enforce and array_length(v_person_ids, 1) is not null then
          update public.people
             set is_anonymous = true,
                 name = null,
                 preferred_name = null,
                 email = null,
                 phone = null,
                 instagram_handle = null,
                 pronouns = null,
                 notes = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'rider_profiles', 'people', 'skipped', sqlerrm);
    end;

    -- F. Portal accounts.
    --
    -- auth.users is never touched. audit_log.actor_id references it with no ON
    -- DELETE, as do ~120 other created_by/updated_by columns across the schema, so
    -- deleting an account that ever wrote a row raises 23503 -- and the audit
    -- trail is retained separately for governance, security, audit, insurance and
    -- legal purposes anyway. What this rule does is clear the personal details on
    -- the linked people row and remove any role grant that outlived the
    -- deactivation. /privacy is worded to match (see the same PR).
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'portal_accounts' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'skipped', '{}');
      else
        v_person_ids := array(
          select p.id
            from public.people p
            join public.deactivated_users d on d.user_id = p.auth_user_id
           where p.tenant_id = v_tenant
             and d.deactivated_at < p_as_of - v_period
             and not p.is_anonymous
        );
        perform public.retention_log(v_run_id, 'portal_accounts', 'people', 'anonymized', v_person_ids);
        if v_enforce and array_length(v_person_ids, 1) is not null then
          -- tenant_id, not just the user id. deactivated_users is platform-wide
          -- (20260906010000 keeps it global: one row per auth account), so the
          -- unscoped form deleted that account's roles in every tenant it belonged
          -- to -- the one place the purge wrote outside the tenant it was sweeping.
          delete from public.user_roles
           where tenant_id = v_tenant
             and user_id in (
               select p.auth_user_id from public.people p where p.id = any(v_person_ids)
             );
          update public.people
             set is_anonymous = true,
                 name = null,
                 preferred_name = null,
                 email = null,
                 phone = null,
                 instagram_handle = null,
                 pronouns = null,
                 notes = null
           where id = any(v_person_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'portal_accounts', 'people', 'skipped', sqlerrm);
    end;

    -- G. Unclaimed portal invitations. pending_role_grants holds an email address
    -- and its own header (20260824060000) says there is no cleanup job; this is
    -- that job. Note the residual: the table is audited, so the delete writes the
    -- email into audit_log.old_data, which has no clock of its own. That is a real
    -- if smaller exposure than leaving the live row, and is tracked separately.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
         where policy_key = 'pending_role_grants' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', '{}');
      else
        v_ids := array(
          select g.id
            from public.pending_role_grants g
           where g.tenant_id = v_tenant
             and ((g.status in ('claimed', 'revoked') and g.created_at < p_as_of - v_period)
              or (g.status = 'pending' and g.expires_at < p_as_of - v_period))
        );
        perform public.retention_log(v_run_id, 'pending_role_grants', 'pending_role_grants', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.pending_role_grants where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'pending_role_grants', 'pending_role_grants', 'skipped', sqlerrm);
    end;

    -- I. Audit trail snapshots (#720). Redaction, not deletion.
    --
    -- Runs after every rule above on purpose: A, C, E and G have just written
    -- this tenant's old values into audit_log.old_data, and the entries they
    -- wrote tonight are the ones a reader would most expect to find scrubbed
    -- seven years from now. Order does not matter for correctness -- the clock
    -- is the entry's own occurred_at -- but it is the order the rules read in.
    --
    -- Only entries that still hold something are counted or touched: a snapshot
    -- whose registered keys are all jsonb null already is finished, and without
    -- that test it would be rewritten and re-reported every night forever.
    --
    -- Null tenant_id means an audit entry for one of the global tables
    -- (deactivated_users, retention_policies, tenants ...). Those belong to the
    -- platform tenant, which is how 20260906160000 backfilled the historical
    -- ones, so the oldest tenant's run is what sweeps them -- rather than their
    -- being visible to every tenant's admin and swept by none.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'audit_log_snapshots' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'audit_log_snapshots', 'audit_log', 'skipped', '{}');
      else
        v_ids := array(
          select a.id
            from public.audit_log a
           where (a.tenant_id = v_tenant
                  or (a.tenant_id is null
                      and v_tenant = (select t.id from public.tenants t
                                       order by t.created_at limit 1)))
             and a.redacted_at is null
             and a.occurred_at < p_as_of - v_period
             and public.retention_snapshot_has_personal_data(a.table_name, a.old_data, a.new_data)
        );
        perform public.retention_log(v_run_id, 'audit_log_snapshots', 'audit_log', 'redacted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.audit_log a
             set old_data = public.retention_redact_snapshot(a.table_name, a.old_data),
                 new_data = public.retention_redact_snapshot(a.table_name, a.new_data),
                 redacted_at = now()
           where a.id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'audit_log_snapshots', 'audit_log', 'skipped', sqlerrm);
    end;

    -- J. Merge snapshots (#720). Same treatment, one clock later in the record's
    -- life: person_merges holds two whole people rows, and the registered people
    -- columns are the same eleven rules D1 and D2 clear on a live person. The
    -- merge itself -- who merged whom, when, and the counts of what moved -- is
    -- untouched, which is what the table exists for.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_merge_snapshots' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_merge_snapshots', 'person_merges', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.person_merges m
           where m.tenant_id = v_tenant
             and m.redacted_at is null
             and m.merged_at < p_as_of - v_period
             and public.retention_snapshot_has_personal_data('people', m.merged_snapshot, m.survivor_before)
        );
        perform public.retention_log(v_run_id, 'person_merge_snapshots', 'person_merges', 'redacted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.person_merges m
             set merged_snapshot = public.retention_redact_snapshot('people', m.merged_snapshot),
                 survivor_before = public.retention_redact_snapshot('people', m.survivor_before),
                 redacted_at = now()
           where m.id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_merge_snapshots', 'person_merges', 'skipped', sqlerrm);
    end;

    -- K. Staff messages and resent receipts (#1203). What survives is the fact
    -- of the send -- when, by whom, about which record, and whether it was
    -- delivered; what goes is the correspondence itself and everyone named in
    -- it. Cleared rather than deleted, for the same reason rule E2 keeps the
    -- gear request: the detail view says "three messages went out about this
    -- request" long after it may say what any of them were.
    --
    -- to_email, subject and body are not null, so they take the empty-string
    -- sentinel rule C uses rather than the constraints being dropped.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'outbound_messages' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'outbound_messages', 'outbound_messages', 'skipped', '{}');
      else
        v_ids := array(
          select m.id
            from public.outbound_messages m
           where m.tenant_id = v_tenant
             and (m.person_id is not null or m.to_email <> ''
                  or m.subject <> '' or m.body <> '')
             and m.created_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'outbound_messages', 'outbound_messages', 'anonymized', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          update public.outbound_messages
             set person_id = null, to_email = '', subject = '', body = ''
           where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'outbound_messages', 'outbound_messages', 'skipped', sqlerrm);
    end;

    -- L. Record claims (#1296). What somebody typed to persuade us a record
    -- is theirs -- a name, usually an address or a phone number, sometimes a
    -- note -- which a refused claim leaves us holding about a person who is
    -- not the person in the record.
    --
    -- Deleted rather than cleared, like the volunteer application it most
    -- resembles: person_claims is audited, so the decision itself (approved or
    -- refused, by whom, when) survives in audit_log on its own clock, and
    -- nothing reports on a claim.
    --
    -- This rule has no audit-log residual, unlike rule G's. Every stated_*
    -- column and both notes are in audited_tables.redacted_columns
    -- (20260916060000), so the trigger strips them before recording -- the
    -- write-time half of the two mechanisms in docs/spec/audit.md. The delete
    -- therefore leaves no copy of what the claimant typed anywhere.
    --
    -- updated_at carries both questions the decision record asks on one clock.
    -- It is the moment of the decision for a claim somebody decided, and --
    -- defaulted to created_at and maintained by set_updated_at, which no
    -- client can backdate -- the moment it was sent for one nobody did.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_claims' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_claims', 'person_claims', 'skipped', '{}');
      else
        v_ids := array(
          select c.id
            from public.person_claims c
           where c.tenant_id = v_tenant
             and c.updated_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'person_claims', 'person_claims', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.person_claims where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_claims', 'person_claims', 'skipped', sqlerrm);
    end;

    -- M. Hours a volunteer logged themselves (#1296, #1165).
    --
    -- Only the entries that became nothing. A confirmed submission is the
    -- provenance of a volunteer_hours row -- the record that the volunteer
    -- entered those hours rather than a staffer entering them on their behalf
    -- -- so deleting it on a clock of its own would leave the ledger asserting
    -- something with nothing behind it. `status <> 'confirmed'` is therefore
    -- the predicate, not an age on every row; a confirmed entry whose ledger
    -- row was later deleted (the reference is on delete set null) stays too,
    -- because what it evidences is unchanged.
    --
    -- No audit-log residual here either: `notes` and `review_note` are in this
    -- table's redacted_columns (20260916090000), so the free text a volunteer
    -- wrote was never recorded in a snapshot to begin with.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'volunteer_hour_submissions' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'skipped', '{}');
      else
        v_ids := array(
          select s.id
            from public.volunteer_hour_submissions s
           where s.tenant_id = v_tenant
             and s.status <> 'confirmed'
             and s.updated_at < p_as_of - v_period
        );
        perform public.retention_log(v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.volunteer_hour_submissions where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'volunteer_hour_submissions', 'volunteer_hour_submissions', 'skipped', sqlerrm);
    end;

    -- N, part two. The log line for the website-account rule, written once per
    -- tenant's run -- rule H's shape, and for its reason: a rule that appears
    -- in no run reads on the Data Retention page as a rule that was skipped.
    -- The count is the platform's, not this tenant's, and the page says so.
    --
    -- This tenant's own mode still decides what the line says: 'off' reports
    -- nothing rather than reporting a number this organization asked not to be
    -- shown a proposal for. It has already had its say in the unanimity test
    -- above, which is what stopped the delete.
    begin
      select mode into v_mode
        from public.retention_policies
       where policy_key = 'constituent_accounts' and tenant_id = v_tenant;

      if v_account_error is not null then
        v_failed := true;
        insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
        values (v_tenant, v_run_id, 'constituent_accounts', 'auth.users', 'skipped', v_account_error);
      elsif v_mode is null or v_mode = 'off' then
        perform public.retention_log(v_run_id, 'constituent_accounts', 'auth.users', 'skipped', '{}');
      else
        perform public.retention_log(v_run_id, 'constituent_accounts', 'auth.users', 'deleted', v_account_ids);
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'constituent_accounts', 'auth.users', 'skipped', sqlerrm);
    end;

    -- O. Volunteer screening outcomes (#1360).
    --
    -- coalesce(expires_on, cleared_on): a clearance that runs to 2032 is live
    -- until 2032, so the clock starts where the clearance ends, and falls back
    -- to the decision for one that never expires. The ::date cast is load
    -- bearing -- p_as_of is a timestamptz and both columns are date.
    --
    -- No audit-log residual to think about, and no redaction pass: this table
    -- has no free-text column, so the snapshot audit_log kept was already
    -- nothing but ids and dates.
    begin
      select period, mode into v_period, v_mode
        from public.retention_policies
       where policy_key = 'person_screenings' and tenant_id = v_tenant;
      v_enforce := not p_dry_run and v_mode = 'enforce';

      if v_mode = 'off' then
        perform public.retention_log(v_run_id, 'person_screenings', 'person_screenings', 'skipped', '{}');
      else
        v_ids := array(
          select s.id
            from public.person_screenings s
           where s.tenant_id = v_tenant
             and coalesce(s.expires_on, s.cleared_on) < (p_as_of - v_period)::date
        );
        perform public.retention_log(v_run_id, 'person_screenings', 'person_screenings', 'deleted', v_ids);
        if v_enforce and array_length(v_ids, 1) is not null then
          delete from public.person_screenings where id = any(v_ids);
        end if;
      end if;
    exception when others then
      v_failed := true;
      insert into public.retention_run_tables (tenant_id, run_id, policy_key, table_name, action, error)
      values (v_tenant, v_run_id, 'person_screenings', 'person_screenings', 'skipped', sqlerrm);
    end;

    update public.retention_runs
       set finished_at = now(),
           status = case when v_failed then 'partial' else 'succeeded' end
     where id = v_run_id;
  end loop;

  -- A single-tenant call answers with its run, which is what the portal needs
  -- to link straight to it. A sweep has no single run to name, and cron ignores
  -- the result.
  return v_result_run_id;
end;
$function$;
