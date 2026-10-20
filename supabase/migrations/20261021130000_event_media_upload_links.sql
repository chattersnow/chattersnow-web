-- Event media: a shareable upload link for a photographer or videographer
-- with no portal account (#1620, follows #1605).
--
--   1. `event_media_upload_links`, one row per link a coordinator hands out.
--   2. `event_media` learns who uploaded through a link, the photo's
--      thumbnail, the rights the uploader confirmed, and the receipt that lets
--      them take back a mistake.
--   3. Staff: create, revoke and list, at events:manage / events:view.
--   4. The link holder: resolve, read the page, claim upload slots, record an
--      upload, delete one of their own -- every call through one resolver.
--   5. uploader_name() names the link; expired_event_media() returns the
--      thumbnail too, so the purge takes both objects.
--
-- THE LINK IS A SINGLE-PURPOSE CAPABILITY, NOT A SIGN-IN, as with #1502's
-- answer links (20261001200000). It opens one page showing the event's name
-- and date and the link's own label -- no registrant, no existing media -- and
-- it can put files into that one event and nothing else.
--
-- THE RAW TOKEN NEVER REACHES THE DATABASE. The Server Action mints 32 random
-- bytes, shows them once, and passes only their SHA-256 here. The hash is the
-- one column left out of the select grant, because the public functions take
-- a hash, which makes the hash as good as the link.
--
-- NO `anon` POLICY ON storage.objects. The artwork-submissions pattern (#870,
-- technical spec §7, "Storage"): a rate-limited claim validates the link, and
-- the Server Action then mints signed upload tokens with the service-role
-- client for paths it chooses. Recording re-checks the link and that the path
-- is under the link's tenant and event, and reads size and type off the
-- stored object. An upload never recorded is an orphan, and #1608's daily
-- sweep collects it.
--
-- PHOTOS ARE KEPT AS THE ORIGINAL (decided on #1620): a photographer's
-- deliverable is full resolution, and the portal's 2048px re-encode would
-- throw it away for good. Each photo also gets a 2048px JPEG thumbnail at
-- `{uuid}-thumb.jpg` beside it, for the gallery. The path is derived here
-- from the original's, never taken from the client.
--
-- UNKNOWN, EXPIRED, REVOKED, SETTING-OFF, DEMO, DELETED-EVENT AND OTHER-HOST
-- LINKS ARE ONE REFUSAL, `LINK_INVALID`, so a caller cannot tell them apart.
-- The tenant is resolved from the request host by public_tenant_id(), which
-- answers on a portal host too -- the platform tenant has no public site.
--
-- RIGHTS. The page asks the uploader to confirm the files are theirs to give
-- and that the organization may use them as its `events.media_upload_rights`
-- paragraphs say -- a consent scoped to what is being uploaded, not a
-- site-wide terms acceptance (#1318). The paragraphs are snapshotted onto each
-- row from site_content, never from the client, as artwork_submissions does
-- (#1319).

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------

create table public.event_media_upload_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null,
  -- Who the link is for, e.g. "Sam -- photographer". Shown on the page and
  -- as the uploader of every file sent through it.
  label text not null
    constraint event_media_upload_links_label_check
      check (char_length(btrim(label)) between 1 and 120),
  -- SHA-256 of the token in the URL, hex. Never the token itself.
  token_hash text not null
    constraint event_media_upload_links_token_hash_check
      check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  -- The abuse bound: bytes recorded through this link may not pass it.
  max_bytes bigint not null default 53687091200
    constraint event_media_upload_links_max_bytes_check
      check (max_bytes between 1073741824 and 1099511627776),
  revoked_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint event_media_upload_links_token_hash_key unique (token_hash),
  constraint event_media_upload_links_tenant_id_key unique (tenant_id, id),
  constraint event_media_upload_links_event_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade
);

create index event_media_upload_links_event_idx
  on public.event_media_upload_links (tenant_id, event_id, created_at);

comment on table public.event_media_upload_links is
  'A link that lets somebody without a portal account upload photos and videos to one event (#1620). token_hash is the SHA-256 of the token in the URL -- the token itself is never stored -- and is withheld from the select grant, because the public functions accept a hash. Written only by create_event_media_upload_link() and revoke_event_media_upload_link().';

alter table public.event_media_upload_links enable row level security;

-- The revoke first, because a hosted project's default privileges hand every
-- new table to both roles (20260911010000, section 4). Everything but the hash.
revoke all on public.event_media_upload_links from public, anon, authenticated;
grant select (id, tenant_id, event_id, label, expires_at, max_bytes, revoked_at, created_by, created_at)
  on public.event_media_upload_links to authenticated;

create policy "event_media_upload_links select"
  on public.event_media_upload_links
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

-- The hash is redacted from the trail: the public functions take a hash, so
-- an audit reader holding it would hold the link.
insert into public.audited_tables (table_name, redacted_columns)
values ('event_media_upload_links', array['token_hash']);

create trigger audit_log_row after insert or update or delete
  on public.event_media_upload_links
  for each row execute function public.audit_log_row();

alter table public.event_media
  -- Set null on its own when the link row goes, keeping tenant_id: the file
  -- stays, and so does the fact that nobody signed in sent it.
  add column upload_link_id uuid,
  add constraint event_media_upload_link_fkey
    foreign key (tenant_id, upload_link_id)
    references public.event_media_upload_links (tenant_id, id)
    on delete set null (upload_link_id),
  -- A photo uploaded through a link is the original; this is its 2048px JPEG
  -- for the gallery. Null for everything else.
  add column thumb_path text,
  add constraint event_media_thumb_path_in_event check (
    thumb_path is null
    or thumb_path like tenant_id::text || '/' || event_id::text || '/%'
  ),
  -- SHA-256 of the receipt the uploader's page holds for this one file, so it
  -- can be taken back in the same session (decided on #1620). Readable at
  -- events:view, which is harmless: deleting also needs the link's own hash.
  add column link_receipt_hash text
    constraint event_media_link_receipt_hash_check
      check (link_receipt_hash is null or link_receipt_hash ~ '^[0-9a-f]{64}$'),
  add column rights_confirmed_at timestamptz,
  -- Null with rights_confirmed_at set means the tenant published no rights
  -- paragraphs, so the confirmation was that the files are the uploader's to
  -- give and may be kept with the event -- what the page says in that case.
  add column rights_terms text;

-- Kept out of event_media's audit trail too, for the same reason as the
-- link's hash.
update public.audited_tables
   set redacted_columns = array(
         select distinct unnest(coalesce(redacted_columns, '{}') || array['link_receipt_hash'])
       )
 where table_name = 'event_media';

create index event_media_upload_link_idx
  on public.event_media (tenant_id, upload_link_id)
  where upload_link_id is not null;

comment on column public.event_media.upload_link_id is
  'The upload link this file came through (#1620), or null for a portal upload. uploaded_by is null on these rows.';
comment on column public.event_media.thumb_path is
  'The 2048px JPEG beside a photo stored at full resolution (#1620), for the gallery. Null when the photo itself is the display copy.';
comment on column public.event_media.rights_terms is
  'The tenant''s events.media_upload_rights paragraphs as they stood when a link uploader confirmed them (#1620), joined with blank lines. Written by record_event_media_by_link() from site_content, never from the client.';

-- ---------------------------------------------------------------------------
-- 2. Staff
-- ---------------------------------------------------------------------------

-- Not on the demo tenant, and not while the setting is off -- the same rules
-- that decide whether anybody can upload at all (can_upload_event_media).
create function public.create_event_media_upload_link(
  p_event_id uuid,
  p_label text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_max_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_id uuid;
begin
  if v_tenant_id is null
     or not public.has_permission('events', 'manage')
     or public.current_tenant_is_demo() then
    raise exception 'PERMISSION_DENIED';
  end if;

  if not public.tenant_event_media_uploads_enabled(v_tenant_id) then
    raise exception 'UPLOADS_DISABLED';
  end if;

  if not exists (
    select 1 from public.events e
     where e.id = p_event_id and e.tenant_id = v_tenant_id
  ) then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if p_expires_at is null
     or p_expires_at <= now()
     or p_expires_at > now() + interval '1 year' then
    raise exception 'INVALID_EXPIRY';
  end if;

  insert into public.event_media_upload_links (
    tenant_id, event_id, label, token_hash, expires_at, max_bytes, created_by
  )
  values (
    v_tenant_id, p_event_id, btrim(coalesce(p_label, '')), p_token_hash,
    p_expires_at, coalesce(p_max_bytes, 53687091200), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.create_event_media_upload_link(uuid, text, text, timestamptz, bigint) is
  'Creates an upload link for an event (#1620). events:manage, the tenant''s media uploads on, never the demo tenant. Takes the SHA-256 of a token the caller minted. Raises PERMISSION_DENIED, UPLOADS_DISABLED, EVENT_NOT_FOUND or INVALID_EXPIRY (past, or more than a year out); a bad label, hash or cap fails its check constraint.';

revoke all on function public.create_event_media_upload_link(uuid, text, text, timestamptz, bigint) from public, anon;
grant execute on function public.create_event_media_upload_link(uuid, text, text, timestamptz, bigint) to authenticated;

-- Stops new uploads; what was uploaded stays. Revoking twice is a no-op.
create function public.revoke_event_media_upload_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.event_media_upload_links
     set revoked_at = coalesce(revoked_at, now())
   where id = p_link_id
     and tenant_id = (select public.current_tenant_id());

  if not found then
    raise exception 'LINK_NOT_FOUND';
  end if;
end;
$$;

comment on function public.revoke_event_media_upload_link(uuid) is
  'Revokes an event media upload link (#1620): no further uploads through it, nothing already uploaded is touched. events:manage.';

revoke all on function public.revoke_event_media_upload_link(uuid) from public, anon;
grant execute on function public.revoke_event_media_upload_link(uuid) to authenticated;

-- Invoker: both tables are read under their own select policies, so a caller
-- without events:view gets nothing.
create function public.event_media_upload_link_list(p_event_id uuid)
returns table (
  id uuid,
  label text,
  expires_at timestamptz,
  max_bytes bigint,
  revoked_at timestamptz,
  created_at timestamptz,
  files integer,
  bytes bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select l.id, l.label, l.expires_at, l.max_bytes, l.revoked_at, l.created_at,
         count(m.id)::integer,
         coalesce(sum(m.size_bytes), 0)::bigint
    from public.event_media_upload_links l
    left join public.event_media m
      on m.tenant_id = l.tenant_id and m.upload_link_id = l.id
   where l.tenant_id = (select public.current_tenant_id())
     and l.event_id = p_event_id
   group by l.id
   order by l.created_at desc;
$$;

comment on function public.event_media_upload_link_list(uuid) is
  'An event''s upload links with the files and bytes recorded through each (#1620), newest first. Security invoker: RLS on both tables scopes it.';

revoke all on function public.event_media_upload_link_list(uuid) from public, anon;
grant execute on function public.event_media_upload_link_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The link holder
-- ---------------------------------------------------------------------------

-- The one lookup every public function makes. for update when the caller is
-- about to check the byte cap, so two records racing past it wait in turn.
create function public.resolve_event_media_upload_link(
  p_token_hash text,
  p_for_update boolean
)
returns table (
  link_id uuid,
  tenant_id uuid,
  event_id uuid,
  label text,
  max_bytes bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.public_tenant_id();
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or v_tenant_id is null then
    raise exception 'LINK_INVALID';
  end if;

  if p_for_update then
    return query
      select l.id, l.tenant_id, l.event_id, l.label, l.max_bytes
        from public.event_media_upload_links l
        join public.tenants t on t.id = l.tenant_id
       where l.token_hash = p_token_hash
         and l.tenant_id = v_tenant_id
         and l.revoked_at is null
         and l.expires_at > now()
         and t.plan <> 'demo'
         and public.tenant_event_media_uploads_enabled(l.tenant_id)
       for update of l;
  else
    return query
      select l.id, l.tenant_id, l.event_id, l.label, l.max_bytes
        from public.event_media_upload_links l
        join public.tenants t on t.id = l.tenant_id
       where l.token_hash = p_token_hash
         and l.tenant_id = v_tenant_id
         and l.revoked_at is null
         and l.expires_at > now()
         and t.plan <> 'demo'
         and public.tenant_event_media_uploads_enabled(l.tenant_id);
  end if;

  if not found then
    raise exception 'LINK_INVALID';
  end if;
end;
$$;

comment on function public.resolve_event_media_upload_link(text, boolean) is
  'Internal to the public upload-link functions (#1620): the live link a token hash names on the request host''s tenant, or LINK_INVALID -- unknown, expired, revoked, other tenant, demo tenant or uploads turned off alike. A deleted event cascades its links away. Never called by a client.';

revoke execute on function public.resolve_event_media_upload_link(text, boolean)
  from public, anon, authenticated;

-- The tenant's rights paragraphs, joined, or null when it publishes none.
create function public.tenant_media_upload_rights(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select string_agg(p.paragraph, E'\n\n' order by p.ordinality)
    from public.site_content sc
    cross join lateral jsonb_array_elements_text(sc.value)
      with ordinality as p(paragraph, ordinality)
   where sc.tenant_id = p_tenant_id
     and sc.key = 'events.media_upload_rights'
     and jsonb_typeof(sc.value) = 'array'
     and btrim(p.paragraph) <> '';
$$;

comment on function public.tenant_media_upload_rights(uuid) is
  'The tenant''s events.media_upload_rights paragraphs joined with blank lines, or null when there are none (#1620). Internal.';

revoke execute on function public.tenant_media_upload_rights(uuid) from public, anon, authenticated;

-- What the page shows: the event's name and dates, the link's label and
-- expiry, the rights paragraphs. Nothing else about the event.
--
-- Callable by anon, because the people this exists for have no account.
-- Rate-limited per (route, ip) like get_registration_answer_request(): the
-- token is 256 bits and cannot be guessed, but the limiter stops somebody
-- trying.
create function public.get_event_media_upload_link(
  p_token_hash text,
  p_ip_address inet
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_result jsonb;
begin
  if not public.check_rate_limit('get_event_media_upload_link', p_ip_address, 30, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  select * into v_link
    from public.resolve_event_media_upload_link(p_token_hash, false);

  select jsonb_build_object(
           'event_name', e.name,
           'starts_at', e.starts_at,
           'ends_at', e.ends_at,
           'timezone', e.timezone,
           'label', l.label,
           'expires_at', l.expires_at,
           'rights_terms', public.tenant_media_upload_rights(l.tenant_id)
         )
    into v_result
    from public.event_media_upload_links l
    join public.events e
      on e.id = l.event_id and e.tenant_id = l.tenant_id
   where l.id = v_link.link_id;

  return v_result;
end;
$$;

comment on function public.get_event_media_upload_link(text, inet) is
  'The public page behind an event media upload link (#1620): {event_name, starts_at, ends_at, timezone, label, expires_at, rights_terms}. No registrant data and no existing media. Raises LINK_INVALID (see resolve_event_media_upload_link) or RATE_LIMITED.';

revoke execute on function public.get_event_media_upload_link(text, inet) from public;
grant execute on function public.get_event_media_upload_link(text, inet) to anon, authenticated;

-- Before the Server Action mints signed upload tokens with the service role:
-- the rate limit, the live-link check, and the byte cap against what the
-- browser says it is about to send. Recording checks the cap again against
-- what actually arrived. The tenant and event come back from here; nothing the
-- caller sent reaches a path.
create function public.claim_event_media_link_upload_slots(
  p_token_hash text,
  p_count integer,
  p_bytes bigint,
  p_ip_address inet
)
returns table (tenant_id uuid, event_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_used bigint;
begin
  if not public.check_rate_limit('claim_event_media_link_upload_slots', p_ip_address, 60, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  select * into v_link
    from public.resolve_event_media_upload_link(p_token_hash, false);

  if p_count is null or p_count < 1 or p_count > 100 or p_bytes is null or p_bytes < 0 then
    raise exception 'INVALID_BATCH';
  end if;

  select coalesce(sum(m.size_bytes), 0) into v_used
    from public.event_media m
   where m.tenant_id = v_link.tenant_id
     and m.upload_link_id = v_link.link_id;

  if v_used + p_bytes > v_link.max_bytes then
    raise exception 'OVER_CAP';
  end if;

  return query select v_link.tenant_id, v_link.event_id;
end;
$$;

comment on function public.claim_event_media_link_upload_slots(text, integer, bigint, inet) is
  'Validates an upload link before the server mints signed upload tokens for it (#1620): rate limit, live link, at most 100 files, and the link''s byte cap against bytes already recorded plus p_bytes. Returns the link''s tenant and event. Raises RATE_LIMITED, LINK_INVALID, INVALID_BATCH or OVER_CAP.';

revoke execute on function public.claim_event_media_link_upload_slots(text, integer, bigint, inet) from public;
grant execute on function public.claim_event_media_link_upload_slots(text, integer, bigint, inet) to anon, authenticated;

-- Records a finished upload through a link. record_event_media()'s shape: the
-- path must be this link's tenant and event, size and type are read off the
-- stored object, and the thumbnail is looked for at the path derived from the
-- original's. The cap is checked again against the real size; a file over it
-- is not recorded, and the sweep takes the object.
create function public.record_event_media_by_link(
  p_token_hash text,
  p_path text,
  p_original_filename text,
  p_rights_confirmed boolean,
  p_receipt_hash text,
  p_ip_address inet
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_type text;
  v_size bigint;
  v_used bigint;
  v_thumb text;
  v_id uuid;
begin
  -- Generous: one call per file, and a photographer's batch is hundreds.
  if not public.check_rate_limit('record_event_media_by_link', p_ip_address, 1000, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  select * into v_link
    from public.resolve_event_media_upload_link(p_token_hash, true);

  if p_rights_confirmed is not true then
    raise exception 'RIGHTS_REQUIRED';
  end if;

  if p_receipt_hash is null or p_receipt_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_RECEIPT';
  end if;

  if split_part(coalesce(p_path, ''), '/', 1) <> v_link.tenant_id::text
     or public.event_media_path_event_id(p_path) is distinct from v_link.event_id then
    raise exception 'PERMISSION_DENIED';
  end if;

  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint
    into v_type, v_size
    from storage.objects o
   where o.bucket_id = 'event-media'
     and o.name = p_path;

  if not found then
    raise exception 'MEDIA_NOT_FOUND';
  end if;

  select coalesce(sum(m.size_bytes), 0) into v_used
    from public.event_media m
   where m.tenant_id = v_link.tenant_id
     and m.upload_link_id = v_link.link_id
     and m.storage_path <> p_path;

  if v_used + coalesce(v_size, 0) > v_link.max_bytes then
    raise exception 'OVER_CAP';
  end if;

  if v_type like 'image/%' then
    select o.name into v_thumb
      from storage.objects o
     where o.bucket_id = 'event-media'
       and o.name = regexp_replace(p_path, '\.[a-z0-9]+$', '-thumb.jpg');
  end if;

  insert into public.event_media (
    tenant_id, event_id, storage_path, original_filename, content_type,
    size_bytes, uploaded_by, upload_link_id, thumb_path, link_receipt_hash,
    rights_confirmed_at, rights_terms
  )
  values (
    v_link.tenant_id, v_link.event_id, p_path,
    left(coalesce(nullif(btrim(p_original_filename), ''), 'upload'), 255),
    v_type, coalesce(v_size, 0), null, v_link.link_id, v_thumb, p_receipt_hash,
    now(), public.tenant_media_upload_rights(v_link.tenant_id)
  )
  -- A retried record of the same slot: the newer receipt is the one the page
  -- now holds.
  on conflict (storage_path) do update
    set link_receipt_hash = excluded.link_receipt_hash
    where event_media.upload_link_id = excluded.upload_link_id
  returning id into v_id;

  if v_id is null then
    raise exception 'PERMISSION_DENIED';
  end if;

  return v_id;
end;
$$;

comment on function public.record_event_media_by_link(text, text, text, boolean, text, inet) is
  'Records a finished upload through an event media upload link (#1620): the path must be the link''s tenant and event, size and type are read off storage.objects, the photo''s thumbnail is found at {uuid}-thumb.jpg, the byte cap is re-checked against the real size, and the rights paragraphs are snapshotted from site_content. Returns the event_media id. Raises RATE_LIMITED, LINK_INVALID, RIGHTS_REQUIRED, INVALID_RECEIPT, PERMISSION_DENIED, MEDIA_NOT_FOUND or OVER_CAP.';

revoke execute on function public.record_event_media_by_link(text, text, text, boolean, text, inet) from public;
grant execute on function public.record_event_media_by_link(text, text, text, boolean, text, inet) to anon, authenticated;

-- Taking back a mistake, in the same session (decided on #1620): only with the
-- receipt the page was handed when that file was recorded, which lives in the
-- page's memory and nowhere else, and only while the link is live. Deletes
-- the row and returns both paths for the Server Action to remove; an object
-- it fails to remove is an orphan the sweep collects.
create function public.delete_event_media_by_link(
  p_token_hash text,
  p_media_id uuid,
  p_receipt_hash text,
  p_ip_address inet
)
returns table (storage_path text, thumb_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
begin
  if not public.check_rate_limit('delete_event_media_by_link', p_ip_address, 200, interval '15 minutes') then
    raise exception 'RATE_LIMITED';
  end if;

  select * into v_link
    from public.resolve_event_media_upload_link(p_token_hash, false);

  return query
    delete from public.event_media m
     where m.id = p_media_id
       and m.tenant_id = v_link.tenant_id
       and m.upload_link_id = v_link.link_id
       and m.link_receipt_hash = p_receipt_hash
    returning m.storage_path, m.thumb_path;

  if not found then
    raise exception 'MEDIA_NOT_FOUND';
  end if;
end;
$$;

comment on function public.delete_event_media_by_link(text, uuid, text, inet) is
  'Deletes one file uploaded through an upload link, by the receipt its uploader''s page holds (#1620). Returns the storage and thumbnail paths to remove. Raises RATE_LIMITED, LINK_INVALID or MEDIA_NOT_FOUND.';

revoke execute on function public.delete_event_media_by_link(text, uuid, text, inet) from public;
grant execute on function public.delete_event_media_by_link(text, uuid, text, inet) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Who uploaded it, and what the purge removes
-- ---------------------------------------------------------------------------

-- 20261021090000's body, with the link's label first.
create or replace function public.uploader_name(public.event_media)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select l.label || ' (upload link)'
       from public.event_media_upload_links l
      where l.id = $1.upload_link_id
        and l.tenant_id = $1.tenant_id),
    (select coalesce(p.preferred_name, p.name)
       from public.people p
      where p.auth_user_id = $1.uploaded_by
        and p.tenant_id = $1.tenant_id
      limit 1),
    (select coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
       from auth.users u
      where u.id = $1.uploaded_by)
  )
  where $1.tenant_id = (select public.current_tenant_id());
$$;

comment on function public.uploader_name(public.event_media) is
  'The display name of whoever uploaded an event photo or video (#1607, #1620): the upload link''s label, else their person record in the tenant, else the name on their account, else null. Answers only for a row of the caller''s own tenant.';

-- The return type grows a column, which `create or replace` cannot do.
drop function public.expired_event_media(timestamptz);

create function public.expired_event_media(p_now timestamptz default now())
returns table (id uuid, storage_path text, thumb_path text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.storage_path, m.thumb_path
    from public.event_media m
   where public.event_media_expiry(m.tenant_id, m.event_id, m.uploaded_at) <= p_now
   order by m.id;
$$;

comment on function public.expired_event_media(timestamptz) is
  'Event media past its expiry at p_now, across every tenant, with the photo''s thumbnail path where it has one (#1608, #1620). For the daily storage purge only: service_role.';

revoke all on function public.expired_event_media(timestamptz) from public, anon, authenticated;
grant execute on function public.expired_event_media(timestamptz) to service_role;
