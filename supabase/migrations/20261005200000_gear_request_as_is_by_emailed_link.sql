-- Gear requests from before #1367: the as-is acknowledgement by emailed link (#1518)
-- ---------------------------------------------------------------------------
--
-- #1367 put the as-is acknowledgement on the public gear request, and nothing
-- was invented for the rows written before it: they read "Not recorded". A few
-- are still open, and shipped ones never pass through #1519's handout
-- checkout, so the organization had no way to collect it. A box for staff is
-- still not the answer (#1367): the RECIPIENT has to act.
--
-- So staff email the requester a link, #1502's shape exactly. THE LINK IS A
-- SINGLE-PURPOSE CAPABILITY, NOT A SIGN-IN: it opens the shared /acknowledge
-- page (#1519) showing the requester's first name, the items on the request
-- and the current gearAsIsSummary(), and it can record the acknowledgement on
-- that one request and nothing else.
--
-- THE RAW TOKEN NEVER REACHES THE DATABASE (#1049, #1502). The Server Action
-- mints 32 random bytes, mails them, and passes only their SHA-256 here. The
-- hash is left out of the select grant, because the public functions take a
-- hash.
--
-- ONE ROW PER REQUEST. Asking again overwrites the hash, which supersedes the
-- earlier link. The link works for 30 days, until it is used, and stops at
-- once if the request is cancelled or is acknowledged some other way
-- meanwhile (at a handout, #1519). Every dead link is the one refusal,
-- LINK_INVALID.
--
-- THE TYPED NAME. The shared page asks for one, as the handout does, and a
-- ticked box beside a typed name is what makes the act an electronic
-- signature (#1519). It is stored on the request beside the snapshot. Unlike
-- the snapshot it is personal data, so it is redacted from the audit trail and
-- cleared when the request's requester link goes -- by a trigger on
-- person_id, which covers retention rule E2 and a deleted person alike,
-- rather than by re-emitting run_retention_purge().
--
-- ONE PUBLIC RPC PAIR FOR BOTH TOKENS. /acknowledge served only the handout's
-- QR code. get_as_is_acknowledgement() and acknowledge_as_is_by_token() look
-- a token up as a gear-request link first and a handout code second, so the
-- page does not need to be told which it holds -- and #1519's emailed
-- fallback can mail the same page a handout token.

-- ---------------------------------------------------------------------------
-- 1. The typed name on the request
-- ---------------------------------------------------------------------------

alter table public.gear_requests
  add column as_is_typed_name text
    constraint gear_requests_as_is_typed_name_check
      check (as_is_typed_name is null
             or (as_is_acknowledged_at is not null and length(as_is_typed_name) between 1 and 200));

comment on column public.gear_requests.as_is_typed_name is
  'The name the requester typed when acknowledging by emailed link (#1518). Null for the request form, which takes none. Personal data: redacted from the audit log and cleared with person_id.';

update public.audited_tables
   set redacted_columns = array_append(redacted_columns, 'as_is_typed_name')
 where table_name = 'gear_requests'
   and not ('as_is_typed_name' = any(redacted_columns));

create function public.clear_gear_request_as_is_typed_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.person_id is null and old.person_id is not null then
    new.as_is_typed_name := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_gear_request_as_is_typed_name() from public, anon, authenticated;

create trigger clear_gear_request_as_is_typed_name
  before update of person_id on public.gear_requests
  for each row execute function public.clear_gear_request_as_is_typed_name();

-- ---------------------------------------------------------------------------
-- 2. The link
-- ---------------------------------------------------------------------------

create table public.gear_request_acknowledgement_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  request_id uuid not null,
  -- SHA-256 of the token in the email, hex. Never the token itself.
  token_hash text not null
    constraint gear_request_acknowledgement_requests_token_hash_check
      check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users(id) on delete set null,
  -- When the acknowledgement was taken through this link.
  acknowledged_at timestamptz,
  constraint gear_request_acknowledgement_requests_request_key
    unique (tenant_id, request_id),
  constraint gear_request_acknowledgement_requests_token_hash_key
    unique (token_hash),
  constraint gear_request_acknowledgement_requests_request_fkey
    foreign key (tenant_id, request_id)
    references public.gear_requests (tenant_id, id) on delete cascade
);

comment on table public.gear_request_acknowledgement_requests is
  'The emailed link that asks a gear request''s requester to acknowledge the as-is terms (#1518). One row per request; asking again overwrites token_hash, which supersedes the earlier link. token_hash is withheld from the select grant, because the public functions accept a hash. Written only by request_gear_request_acknowledgements() and acknowledge_as_is_by_token().';

alter table public.gear_request_acknowledgement_requests enable row level security;

revoke all on public.gear_request_acknowledgement_requests from public, anon, authenticated;
grant select (id, tenant_id, request_id, expires_at, requested_at, requested_by, acknowledged_at)
  on public.gear_request_acknowledgement_requests to authenticated;

-- Read under the same permission as the requests they describe.
create policy "gear_request_acknowledgement_requests select"
  on public.gear_request_acknowledgement_requests
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('inventory', 'view')
  );

-- ---------------------------------------------------------------------------
-- 3. Asking
-- ---------------------------------------------------------------------------

-- Staff, from the request detail and the Requests list. p_requests is
-- [{"request_id": uuid, "token_hash": hex}, ...]. A request that is another
-- tenant's, cancelled, or already acknowledged is skipped rather than
-- refused; the rows returned are the only ones the action may mail.
create function public.request_gear_request_acknowledgements(p_requests jsonb)
returns table (request_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
begin
  if not public.has_permission('inventory', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_requests is null
     or jsonb_typeof(p_requests) <> 'array'
     or exists (
       select 1
         from jsonb_array_elements(p_requests) r
        where jsonb_typeof(r) <> 'object'
           or coalesce(r->>'request_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or coalesce(r->>'token_hash', '') !~ '^[0-9a-f]{64}$'
     ) then
    raise exception 'ACKNOWLEDGEMENT_REQUESTS_INVALID';
  end if;

  return query
    insert into public.gear_request_acknowledgement_requests as a
      (tenant_id, request_id, token_hash, expires_at, requested_at, requested_by)
    select distinct on (g.id)
           v_tenant_id, g.id, r->>'token_hash', now() + interval '30 days', now(), auth.uid()
      from jsonb_array_elements(p_requests) r
      join public.gear_requests g
        on g.id = (r->>'request_id')::uuid
       and g.tenant_id = v_tenant_id
       and g.status <> 'cancelled'
       and g.as_is_acknowledged_at is null
    on conflict on constraint gear_request_acknowledgement_requests_request_key
    do update set
      token_hash = excluded.token_hash,
      expires_at = excluded.expires_at,
      requested_at = excluded.requested_at,
      requested_by = excluded.requested_by,
      acknowledged_at = null
    returning a.request_id, a.expires_at;
end;
$$;

comment on function public.request_gear_request_acknowledgements(jsonb) is
  'Staff asking requesters to acknowledge the as-is terms by emailed link (#1518). Requires inventory: manage. Takes [{request_id, token_hash}]; writes one 30-day link per request that is not cancelled and not yet acknowledged, superseding any earlier one, and returns the rows written. Raises PERMISSION_DENIED or ACKNOWLEDGEMENT_REQUESTS_INVALID.';

revoke execute on function public.request_gear_request_acknowledgements(jsonb) from public, anon;
grant execute on function public.request_gear_request_acknowledgements(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Following the link
-- ---------------------------------------------------------------------------

-- The request a live link names on this tenant's public site, or null.
create function public.resolve_gear_request_acknowledgement_token(
  p_token_hash text,
  p_for_update boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  if p_for_update then
    select g.id into v_request_id
      from public.gear_request_acknowledgement_requests a
      join public.gear_requests g on g.id = a.request_id and g.tenant_id = a.tenant_id
     where a.token_hash = p_token_hash
       and a.expires_at > now()
       and g.status <> 'cancelled'
       and g.as_is_acknowledged_at is null
       and a.tenant_id = public.public_tenant_id()
     for update of g, a;
  else
    select g.id into v_request_id
      from public.gear_request_acknowledgement_requests a
      join public.gear_requests g on g.id = a.request_id and g.tenant_id = a.tenant_id
     where a.token_hash = p_token_hash
       and a.expires_at > now()
       and g.status <> 'cancelled'
       and g.as_is_acknowledged_at is null
       and a.tenant_id = public.public_tenant_id();
  end if;

  return v_request_id;
end;
$$;

revoke execute on function public.resolve_gear_request_acknowledgement_token(text, boolean)
  from public, anon, authenticated;

-- What the page shows about a request: the requester's first name and the
-- items it asked for. No contact or delivery details.
create function public.gear_request_acknowledgement_view(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'kind', 'gear_request',
           'first_name', nullif(split_part(btrim(coalesce(nullif(btrim(p.preferred_name), ''), p.name, '')), ' ', 1), ''),
           'event_name', null,
           'items', coalesce((
             select jsonb_agg(jsonb_build_object('description', i.description, 'size', i.size)
                              order by m.created_at)
               from public.inventory_movements m
               join public.inventory_items i on i.id = m.inventory_item_id and i.tenant_id = m.tenant_id
              where m.gear_request_id = g.id
                and m.tenant_id = g.tenant_id
                and m.movement_type = 'reserved'
           ), '[]'::jsonb)
         )
    from public.gear_requests g
    left join public.people p on p.id = g.person_id and p.tenant_id = g.tenant_id
   where g.id = p_request_id;
$$;

revoke execute on function public.gear_request_acknowledgement_view(uuid) from public, anon, authenticated;

-- The one lookup behind /acknowledge, for a gear-request link or a handout's
-- code alike. Callable by anon, rate-limited per IP.
create function public.get_as_is_acknowledgement(
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
  v_draft_id uuid;
begin
  if not public.check_rate_limit('get_as_is_acknowledgement', p_ip_address, 30, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  v_request_id := public.resolve_gear_request_acknowledgement_token(p_token_hash, false);
  if v_request_id is not null then
    return public.gear_request_acknowledgement_view(v_request_id);
  end if;

  -- Raises LINK_INVALID when the hash names no open handout either.
  v_draft_id := public.resolve_distribution_acknowledgement_token(p_token_hash, false);
  return public.distribution_acknowledgement_view(v_draft_id)
         || jsonb_build_object('kind', 'handout');
end;
$$;

comment on function public.get_as_is_acknowledgement(text, inet) is
  'The page behind /acknowledge (#1518, #1519): a gear request''s emailed link or a handout''s one-time code. Returns {kind: gear_request | handout, first_name, event_name, items: [{description, size}]}. Raises LINK_INVALID for every kind of dead token. Rate-limited per IP.';

revoke execute on function public.get_as_is_acknowledgement(text, inet) from public;
grant execute on function public.get_as_is_acknowledgement(text, inet) to anon, authenticated;

-- Recording it. p_as_is_text is resolved by the server from
-- src/lib/gear-as-is.ts, never by the browser.
create function public.acknowledge_as_is_by_token(
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
  v_draft_id uuid;
  v_text text;
  v_name text;
begin
  if not public.check_rate_limit('acknowledge_as_is_by_token', p_ip_address, 10, interval '15 minutes') then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  -- for update: the request (or draft) is locked, so a handout recording it
  -- in person at the same moment waits rather than writing a second one.
  v_request_id := public.resolve_gear_request_acknowledgement_token(p_token_hash, true);
  if v_request_id is null then
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
  'Records the as-is acknowledgement through /acknowledge (#1518, #1519): on the gear request a live emailed link names (method emailed_link), else on the open handout a one-time code names (method own_device). Returns which. Raises LINK_INVALID, AS_IS_REQUIRED, AS_IS_TEXT_REQUIRED or NAME_REQUIRED. Rate-limited per IP.';

revoke execute on function public.acknowledge_as_is_by_token(text, boolean, text, text, inet) from public;
grant execute on function public.acknowledge_as_is_by_token(text, boolean, text, text, inet) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Self-check
-- ---------------------------------------------------------------------------

do $check$
begin
  if has_column_privilege('authenticated', 'public.gear_request_acknowledgement_requests', 'token_hash', 'SELECT')
     or has_column_privilege('anon', 'public.gear_request_acknowledgement_requests', 'token_hash', 'SELECT') then
    raise exception 'gear_request_acknowledgement_requests.token_hash is readable';
  end if;
  if has_table_privilege('authenticated', 'public.gear_request_acknowledgement_requests', 'INSERT')
     or has_table_privilege('authenticated', 'public.gear_request_acknowledgement_requests', 'UPDATE') then
    raise exception 'gear_request_acknowledgement_requests is writable by authenticated';
  end if;
end;
$check$;
