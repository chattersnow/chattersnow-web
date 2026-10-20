-- Event media: photos and videos kept with the event they were taken at
-- (#1606, part of #1605).
--
--   1. The private `event-media` bucket, sized for phone video.
--   2. The `events.media_uploads_enabled` setting, its reader and its switch.
--   3. Who may upload: can_upload_event_media(), the event's staff and
--      events:manage, and only while the setting is on.
--   4. storage.objects policies under `{tenant_id}/{event_id}/{uuid}.{ext}`.
--   5. `event_media`, one row per stored object, written only through
--      record_event_media() so size and type are read off the object rather
--      than typed by the browser.
--
-- The bucket follows `documents` (20260930120000): private, no `anon` policy,
-- every object under its tenant's folder, every read a short-lived signed URL.
-- Video goes up by resumable (TUS) upload to a signed token; photos are
-- re-encoded in the browser and go up in one request.

-- ---------------------------------------------------------------------------
-- 1. Storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-media',
  'event-media',
  false,
  -- 10 GiB, for one long 4K clip (350-400 MB a minute). The hosted project's
  -- global upload limit (Dashboard -> Storage -> Settings) must be at least
  -- this, or it wins; supabase/config.toml raises the local one to match.
  10737418240,
  -- HEIC is not here on purpose: the browser re-encodes it to JPEG first, so
  -- nothing the gallery cannot display is ever stored.
  array[
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. The setting
-- ---------------------------------------------------------------------------

-- On when there is no row, like registration.asks_about_minors: a tenant
-- turns it off from the Events page rather than having to find it first.
create function public.tenant_event_media_uploads_enabled(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select (s.value)::boolean
       from public.app_settings s
      where s.tenant_id = p_tenant_id
        and s.key = 'events.media_uploads_enabled'
        and jsonb_typeof(s.value) = 'boolean'),
    true
  );
$$;

comment on function public.tenant_event_media_uploads_enabled(uuid) is
  'Whether the tenant takes event photo and video uploads (#1606): the events.media_uploads_enabled app setting, true when there is no row. Internal to can_upload_event_media() and event_media_uploads_enabled().';

revoke execute on function public.tenant_event_media_uploads_enabled(uuid) from public, anon, authenticated;

create function public.event_media_uploads_enabled()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.has_permission('events', 'view')
      then public.tenant_event_media_uploads_enabled((select public.current_tenant_id()))
  end;
$$;

comment on function public.event_media_uploads_enabled() is
  'Whether the current tenant takes event media uploads (#1606), or null for a caller without events:view. Security definer by design (#887): app_settings'' select policy requires one of six manage permissions. Isolation is current_tenant_id().';

revoke execute on function public.event_media_uploads_enabled() from public, anon;
grant execute on function public.event_media_uploads_enabled() to authenticated;

create function public.set_event_media_uploads_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  if not public.has_permission('events', 'manage') or v_tenant_id is null then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_enabled is null then
    raise exception 'INVALID_SETTING';
  end if;

  insert into public.app_settings (tenant_id, key, value, updated_by)
  values (v_tenant_id, 'events.media_uploads_enabled', to_jsonb(p_enabled), auth.uid())
  on conflict (tenant_id, key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

comment on function public.set_event_media_uploads_enabled(boolean) is
  'Turns the current tenant''s event media uploads on or off (#1606). Gated on events:manage, since the setting lives with the feature. Audit-logged by the app_settings trigger.';

revoke execute on function public.set_event_media_uploads_enabled(boolean) from public, anon;
grant execute on function public.set_event_media_uploads_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who may upload
-- ---------------------------------------------------------------------------

-- The people filming are usually on the event's staff roster without holding
-- events:manage, so the roster counts -- can_write_event_retro()'s rule. The
-- event must be this tenant's, which the roster check implies and events:manage
-- alone does not. Not on the demo tenant: it hands anonymous visitors admin,
-- and this bucket takes 10 GiB files.
-- Definer, because the setting it reads is not readable by the caller; it
-- answers only for the caller's own session and tenant.
create function public.can_upload_event_media(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_event_id is not null
     and not public.current_tenant_is_demo()
     and public.tenant_event_media_uploads_enabled((select public.current_tenant_id()))
     and exists (
       select 1 from public.events e
        where e.id = p_event_id
          and e.tenant_id = (select public.current_tenant_id())
     )
     and (
       public.has_permission('events', 'manage')
       or (public.has_permission('events', 'view') and public.is_on_event_staff(p_event_id))
     );
$$;

comment on function public.can_upload_event_media(uuid) is
  'Whether the caller may upload photos and videos to the event (#1606): events:manage, or events:view and on the event''s staff roster; the event in the caller''s tenant, the tenant''s events.media_uploads_enabled on, and never on the demo tenant.';

revoke all on function public.can_upload_event_media(uuid) from public, anon;
grant execute on function public.can_upload_event_media(uuid) to authenticated;

-- The event an object path names, or null for anything that is not exactly
-- `{tenant uuid}/{event uuid}/{uuid}.{ext}`. A function so a malformed path is
-- a refusal rather than a uuid cast error inside a policy.
create function public.event_media_path_event_id(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm|jpg|png|webp)$'
      then split_part(p_name, '/', 2)::uuid
  end;
$$;

comment on function public.event_media_path_event_id(text) is
  'The event id in an event-media object path ({tenant_id}/{event_id}/{uuid}.{ext}), or null when the path is not that shape (#1606).';

grant execute on function public.event_media_path_event_id(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage policies
-- ---------------------------------------------------------------------------

-- Read: anyone who can read the event. No anon policy, so a path alone opens
-- nothing.
drop policy if exists "event-media select" on storage.objects;
create policy "event-media select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.has_permission('events', 'view')
  );

-- Write. Checked when the portal mints a signed upload token, which is minted
-- with the uploader's own session for exactly that reason.
drop policy if exists "event-media insert" on storage.objects;
create policy "event-media insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.can_upload_event_media(public.event_media_path_event_id(name))
  );

-- No update policy: an object is never overwritten. Removing one is
-- events:manage, for #1607's gallery; #1608's purge runs as service_role.
drop policy if exists "event-media delete" on storage.objects;
create policy "event-media delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.has_permission('events', 'manage')
  );

-- ---------------------------------------------------------------------------
-- 5. event_media
-- ---------------------------------------------------------------------------

create table public.event_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  event_id uuid not null,
  storage_path text not null,
  original_filename text not null
    constraint event_media_original_filename_check
      check (char_length(btrim(original_filename)) between 1 and 255),
  content_type text not null
    constraint event_media_content_type_check
      check (content_type in (
        'video/mp4', 'video/quicktime', 'video/webm',
        'image/jpeg', 'image/png', 'image/webp'
      )),
  -- Derived, so a gallery never has to agree with a typed field.
  kind text not null generated always as (
    case when content_type like 'video/%' then 'video' else 'photo' end
  ) stored,
  size_bytes bigint not null
    constraint event_media_size_bytes_check check (size_bytes >= 0),
  uploaded_by uuid default auth.uid() references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  caption text
    constraint event_media_caption_check
      check (caption is null or char_length(caption) <= 500),
  constraint event_media_storage_path_key unique (storage_path),
  constraint event_media_path_in_event check (
    storage_path like tenant_id::text || '/' || event_id::text || '/%'
  ),
  constraint event_media_event_fkey
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete cascade
);

create index event_media_event_idx
  on public.event_media (tenant_id, event_id, uploaded_at);

comment on table public.event_media is
  'A photo or video stored in the private event-media bucket for one event (#1606). Inserted only by record_event_media() after the upload finishes; kind, size and content type are read off the stored object.';

alter table public.event_media enable row level security;

-- The revoke first, because a hosted project's default privileges hand every
-- new table to both roles (20260911010000, section 4). No insert grant: rows
-- come from record_event_media(). Only the caption is editable.
revoke all on public.event_media from public, anon, authenticated;
grant select, delete on public.event_media to authenticated;
grant update (caption) on public.event_media to authenticated;

create policy "event_media select" on public.event_media
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

create policy "event_media update" on public.event_media
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      public.has_permission('events', 'manage')
      or (uploaded_by = (select auth.uid()) and public.can_upload_event_media(event_id))
    )
  )
  with check (tenant_id = (select public.current_tenant_id()));

create policy "event_media delete" on public.event_media
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'manage')
  );

insert into public.audited_tables (table_name) values ('event_media');

create trigger audit_log_row after insert or update or delete
  on public.event_media
  for each row execute function public.audit_log_row();

-- Records an uploaded object. Definer, because storage.objects is not readable
-- through PostgREST and the size and type have to come from it: the browser
-- says what it meant to send, the object says what arrived. The caller must
-- still be allowed to upload to the event the path names.
create function public.record_event_media(
  p_path text,
  p_original_filename text,
  p_caption text default null
)
returns public.event_media
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_event_id uuid := public.event_media_path_event_id(p_path);
  v_type text;
  v_size bigint;
  v_row public.event_media;
begin
  if v_tenant_id is null
     or split_part(coalesce(p_path, ''), '/', 1) <> v_tenant_id::text
     or not public.can_upload_event_media(v_event_id) then
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

  insert into public.event_media (
    tenant_id, event_id, storage_path, original_filename, content_type,
    size_bytes, uploaded_by, caption
  )
  values (
    v_tenant_id, v_event_id, p_path,
    left(coalesce(nullif(btrim(p_original_filename), ''), 'upload'), 255),
    v_type, coalesce(v_size, 0), auth.uid(),
    nullif(btrim(coalesce(p_caption, '')), '')
  )
  on conflict (storage_path) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.event_media where storage_path = p_path;
  end if;

  return v_row;
end;
$$;

comment on function public.record_event_media(text, text, text) is
  'Records a finished event-media upload (#1606): checks can_upload_event_media() for the event the path names, and reads content type and size off storage.objects. Idempotent per path.';

revoke all on function public.record_event_media(text, text, text) from public, anon;
grant execute on function public.record_event_media(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Event delete
-- ---------------------------------------------------------------------------

-- Media blocks deleting its event, like every other record with history: the
-- rows would cascade away and leave their objects in the bucket with nothing
-- pointing at them. Body from 20260911040000, which last defined it, plus
-- event_media.
create or replace function public.event_linked_record_labels(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
stable
as $function$
declare
  v_labels text[] := '{}';
  v_count bigint;
  v_rel record;
begin
  for v_rel in
    select * from (values
      -- on delete cascade: these rows would be destroyed with the event
      ('event_registrations',   'registrant',                 'registrants'),
      ('event_sponsors',        'sponsor',                    'sponsors'),
      ('event_staff',           'staff assignment',           'staff assignments'),
      ('event_volunteers',      'volunteer signup',           'volunteer signups'),
      ('event_shifts',          'shift',                      'shifts'),
      ('event_incidents',       'incident',                   'incidents'),
      ('discount_codes',        'discount code',              'discount codes'),
      ('giveaways',             'giveaway',                   'giveaways'),
      ('event_media',           'photo or video',             'photos and videos'),
      -- on delete set null: these rows would survive, orphaned
      ('donations',             'linked donation',            'linked donations'),
      ('monetary_donations',    'linked monetary donation',   'linked monetary donations'),
      ('inventory_movements',   'linked inventory movement',  'linked inventory movements'),
      ('event_expenses',        'linked expense',             'linked expenses'),
      ('event_revenue',         'linked revenue entry',       'linked revenue entries'),
      ('reimbursements',        'linked reimbursement',       'linked reimbursements'),
      ('volunteer_hours',       'linked volunteer hours entry', 'linked volunteer hours entries'),
      ('sales',                 'linked sale',                'linked sales')
    ) as t(table_name, singular, plural)
  loop
    -- %I over a literal from the list above, so there's no injection surface.
    execute format('select count(*) from public.%I where event_id = $1', v_rel.table_name)
      into v_count using p_id;

    if v_count > 0 then
      v_labels := v_labels || format(
        '%s %s',
        v_count,
        case when v_count = 1 then v_rel.singular else v_rel.plural end
      );
    end if;
  end loop;

  return v_labels;
end;
$function$;

revoke all on function public.event_linked_record_labels(uuid) from public;
