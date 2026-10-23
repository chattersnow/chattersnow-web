-- Event media on the public site (#1654, follows #1605).
--
--   1. `event_media.is_public`: photos public on upload, videos not. Set by a
--      trigger off the content type, never by the caller, and backfilled by
--      the same rule.
--   2. set_event_media_public(), the only way to change it, at events:manage.
--   3. The `events.public_gallery_enabled` setting, its reader and its switch.
--      On when there is no row, like events.media_uploads_enabled: a tenant
--      that does not want a public gallery turns it off.
--   4. public_event_media(), the public read: the public rows of one public,
--      published event of one tenant, while the setting is on. service_role
--      only, so storage paths never reach the browser -- the server signs
--      short-lived URLs off them and hands out nothing else.
--   5. Chatter Snow's value, seeded on.
--
-- The bucket stays private (20261020130000): there is still no anon policy on
-- storage.objects, and a path alone opens nothing.
--
-- TAKEDOWN. Registering for an event carries the photo agreement and the
-- remedy is objection plus takedown (#1376). Hiding (is_public = false) or
-- deleting a row removes it from the next public request: the public pages
-- render dynamically and read this function every time. A signed URL already
-- handed out stays valid until it expires (an hour), as in the portal.
--
-- RETENTION (#1608). The daily purge deletes the row, so expired media leaves
-- the public gallery with it.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.event_media
  add column is_public boolean not null default false;

-- The backfill is the rule, not an edit anybody made, so it is kept out of
-- the trail.
alter table public.event_media disable trigger audit_log_row;
update public.event_media
   set is_public = true
 where content_type not like 'video/%';
alter table public.event_media enable trigger audit_log_row;

-- The trigger is the only source from here on.
alter table public.event_media alter column is_public drop default;

comment on column public.event_media.is_public is
  'Whether the photo or video shows in the event''s public gallery (#1654). Set on insert by kind -- photos true, videos false -- by event_media_set_is_public(), whatever the caller sent; changed only through set_event_media_public() at events:manage.';

-- content_type rather than kind: a stored generated column is not computed
-- yet when a BEFORE trigger runs. Overwrites whatever was sent, so no insert
-- path can choose its own visibility.
create function public.event_media_set_is_public()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.is_public := new.content_type not like 'video/%';
  return new;
end;
$$;

comment on function public.event_media_set_is_public() is
  'BEFORE INSERT on event_media (#1654): a photo is public on upload, a video is not.';

create trigger event_media_set_is_public
  before insert on public.event_media
  for each row execute function public.event_media_set_is_public();

-- ---------------------------------------------------------------------------
-- 2. Changing it
-- ---------------------------------------------------------------------------

-- Definer, because the column has no update grant: the table's update policy
-- also lets an uploader edit their own caption, and visibility is events:manage
-- alone. Takes a list so the Media card's bulk action is one call. Rows of
-- another tenant are skipped rather than refused, like a delete RLS hides.
create function public.set_event_media_public(p_ids uuid[], p_public boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_count integer;
begin
  if not public.has_permission('events', 'manage') or v_tenant_id is null then
    raise exception 'PERMISSION_DENIED';
  end if;

  if p_public is null then
    raise exception 'INVALID_SETTING';
  end if;

  update public.event_media
     set is_public = p_public
   where tenant_id = v_tenant_id
     and id = any (coalesce(p_ids, '{}'))
     and is_public is distinct from p_public;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.set_event_media_public(uuid[], boolean) is
  'Shows or hides event photos and videos in the public gallery (#1654). events:manage; only the caller''s tenant''s rows change. Returns how many changed. Audit-logged by event_media''s trigger.';

revoke all on function public.set_event_media_public(uuid[], boolean) from public, anon;
grant execute on function public.set_event_media_public(uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The setting
-- ---------------------------------------------------------------------------

create function public.tenant_event_public_gallery_enabled(p_tenant_id uuid)
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
        and s.key = 'events.public_gallery_enabled'
        and jsonb_typeof(s.value) = 'boolean'),
    true
  );
$$;

comment on function public.tenant_event_public_gallery_enabled(uuid) is
  'Whether the tenant shows public event photos and videos on its public site (#1654): the events.public_gallery_enabled app setting, true when there is no row. Internal.';

revoke execute on function public.tenant_event_public_gallery_enabled(uuid) from public, anon, authenticated;

create function public.event_public_gallery_enabled()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when public.has_permission('events', 'view')
      then public.tenant_event_public_gallery_enabled((select public.current_tenant_id()))
  end;
$$;

comment on function public.event_public_gallery_enabled() is
  'Whether the current tenant has a public event gallery (#1654), or null for a caller without events:view. Security definer by design (#887): app_settings'' select policy requires one of six manage permissions.';

revoke execute on function public.event_public_gallery_enabled() from public, anon;
grant execute on function public.event_public_gallery_enabled() to authenticated;

create function public.set_event_public_gallery_enabled(p_enabled boolean)
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
  values (v_tenant_id, 'events.public_gallery_enabled', to_jsonb(p_enabled), auth.uid())
  on conflict (tenant_id, key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

comment on function public.set_event_public_gallery_enabled(boolean) is
  'Turns the current tenant''s public event gallery on or off (#1654). Gated on events:manage. Audit-logged by the app_settings trigger.';

revoke execute on function public.set_event_public_gallery_enabled(boolean) from public, anon;
grant execute on function public.set_event_public_gallery_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The public read
-- ---------------------------------------------------------------------------

-- public_events' rule (20260923150000) -- visibility public, status
-- published -- for an explicit tenant, since the service-role client sends no
-- tenant host. The caller is the server, which takes the tenant from the
-- request host. A photo's path is its thumbnail where it has one (a
-- full-resolution original from an upload link, #1620); never the uploader,
-- the filename or the link.
create function public.public_event_media(p_tenant_id uuid, p_event_id uuid)
returns table (
  id uuid,
  kind text,
  path text,
  content_type text,
  caption text,
  uploaded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id,
         m.kind,
         case when m.kind = 'photo' then coalesce(m.thumb_path, m.storage_path)
              else m.storage_path end,
         case when m.kind = 'photo' and m.thumb_path is not null then 'image/jpeg'
              else m.content_type end,
         m.caption,
         m.uploaded_at
    from public.event_media m
    join public.events e
      on e.tenant_id = m.tenant_id
     and e.id = m.event_id
   where m.tenant_id = p_tenant_id
     and m.event_id = p_event_id
     and m.is_public
     and e.visibility = 'public'
     and e.status = 'published'
     and public.tenant_event_public_gallery_enabled(p_tenant_id)
   order by m.uploaded_at desc, m.id;
$$;

comment on function public.public_event_media(uuid, uuid) is
  'The public photos and videos of one public, published event (#1654), newest first, while the tenant''s events.public_gallery_enabled is on. Returns the path to sign (a photo''s thumbnail where it has one) and nothing about who uploaded it. service_role only: the public pages sign the paths on the server.';

revoke all on function public.public_event_media(uuid, uuid) from public, anon, authenticated;
grant execute on function public.public_event_media(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Chatter Snow
-- ---------------------------------------------------------------------------

-- On, which is also the default: written down so the tenant's choice is a row
-- rather than an absence. Grounded in what Chatter Snow already publishes --
-- event photos are used "on this site" (`events.photo_consent`,
-- 20260922090000) and taken down on request. Scoped by slug, so a fresh local
-- or CI database is a no-op; `on conflict do nothing`, so a choice made before
-- this runs wins.
alter table public.app_settings
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.app_settings (tenant_id, key, value)
select tenant.id, 'events.public_gallery_enabled', 'true'::jsonb
from tenant
on conflict (tenant_id, key) do nothing;

alter table public.app_settings
  enable trigger set_updated_at,
  enable trigger audit_log_row;
