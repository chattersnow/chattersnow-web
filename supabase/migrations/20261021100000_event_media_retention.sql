-- Event media: how long a tenant keeps its event photos and videos (#1608,
-- part of #1605).
--
--   1. The `events.media_retention_days` setting: a whole number of days after
--      the event, or no value (and no row) for "keep indefinitely". There is
--      no default: nothing expires until a tenant picks a period.
--   2. event_media_expiry(), the one rule for when a file expires, and its
--      readers: expires_at(event_media) for each file on the Media card,
--      event_media_event_expires_at() for the card's "kept until" line, and
--      expired_event_media() for the daily purge, which is service_role only.
--
-- The rule: the event's end (its start when it has none) plus the period --
-- but never sooner than 14 days after the setting last changed, and never
-- sooner than 14 days after the file was uploaded. The Media card lists what
-- expires within 14 days so someone can download it first; the two floors are
-- what make that window a guarantee. Without them, picking 30 days on a
-- tenant with a year of footage, shortening the period, or uploading to a
-- long-past event would each delete files on the next run with no warning.
-- app_settings.updated_at is kept by its set_updated_at trigger, so any change
-- to the period, longer or shorter, restarts the floor.

-- ---------------------------------------------------------------------------
-- 1. The setting
-- ---------------------------------------------------------------------------

-- The number of days, or null for "keep indefinitely" -- no row, a JSON null,
-- or anything that is not a number.
create function public.tenant_event_media_retention_days(p_tenant_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select (s.value)::integer
    from public.app_settings s
   where s.tenant_id = p_tenant_id
     and s.key = 'events.media_retention_days'
     and jsonb_typeof(s.value) = 'number';
$$;

comment on function public.tenant_event_media_retention_days(uuid) is
  'The tenant''s events.media_retention_days app setting (#1608): days to keep event media after the event, or null to keep it indefinitely. Internal to the event-media expiry functions.';

revoke execute on function public.tenant_event_media_retention_days(uuid) from public, anon, authenticated;

-- Raises rather than returning null without events:view, because null already
-- means "indefinitely".
create function public.event_media_retention_days()
returns integer
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.has_permission('events', 'view') then
    raise exception 'PERMISSION_DENIED';
  end if;
  return public.tenant_event_media_retention_days((select public.current_tenant_id()));
end;
$$;

comment on function public.event_media_retention_days() is
  'The current tenant''s event media retention period in days, or null for indefinitely (#1608). Raises PERMISSION_DENIED without events:view. Security definer by design (#887): app_settings'' select policy requires one of six manage permissions.';

revoke execute on function public.event_media_retention_days() from public, anon;
grant execute on function public.event_media_retention_days() to authenticated;

-- 30 days at the least, so a typo cannot purge last weekend's footage; ten
-- years at the most, past which "indefinitely" is what was meant.
create function public.set_event_media_retention_days(p_days integer)
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

  if p_days is not null and (p_days < 30 or p_days > 3650) then
    raise exception 'INVALID_SETTING';
  end if;

  insert into public.app_settings (tenant_id, key, value, updated_by)
  values (
    v_tenant_id, 'events.media_retention_days',
    coalesce(to_jsonb(p_days), 'null'::jsonb), auth.uid()
  )
  on conflict (tenant_id, key) do update
    set value = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

comment on function public.set_event_media_retention_days(integer) is
  'Sets how many days after an event the current tenant keeps its photos and videos, 30 to 3650, or null to keep them indefinitely (#1608). Gated on events:manage. Audit-logged by the app_settings trigger.';

revoke execute on function public.set_event_media_retention_days(integer) from public, anon;
grant execute on function public.set_event_media_retention_days(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. When a file expires
-- ---------------------------------------------------------------------------

-- Null when the tenant keeps media indefinitely. p_uploaded_at null gives the
-- event's own date, which greatest() allows since it skips nulls.
create function public.event_media_expiry(
  p_tenant_id uuid,
  p_event_id uuid,
  p_uploaded_at timestamptz
)
returns timestamptz
language sql
security definer
set search_path = public
stable
as $$
  select greatest(
           coalesce(e.ends_at, e.starts_at) + make_interval(days => s.days),
           s.set_at + interval '14 days',
           p_uploaded_at + interval '14 days'
         )
    from (
      select (a.value)::integer as days, a.updated_at as set_at
        from public.app_settings a
       where a.tenant_id = p_tenant_id
         and a.key = 'events.media_retention_days'
         and jsonb_typeof(a.value) = 'number'
    ) s
    join public.events e
      on e.tenant_id = p_tenant_id
     and e.id = p_event_id;
$$;

comment on function public.event_media_expiry(uuid, uuid, timestamptz) is
  'When event media expires (#1608): the event''s end (else start) plus the tenant''s retention days, but no sooner than 14 days after the setting changed or the file was uploaded. Null when the tenant keeps media indefinitely. Internal.';

revoke execute on function public.event_media_expiry(uuid, uuid, timestamptz) from public, anon, authenticated;

-- A computed column, so the Media card reads each file's date with the rows.
-- uploader_name()'s guard: it answers only for a row of the caller's tenant.
create function public.expires_at(public.event_media)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select public.event_media_expiry($1.tenant_id, $1.event_id, $1.uploaded_at)
   where $1.tenant_id = (select public.current_tenant_id());
$$;

comment on function public.expires_at(public.event_media) is
  'When this photo or video will be deleted under the tenant''s retention setting (#1608), or null when it is kept indefinitely. Answers only for a row of the caller''s own tenant.';

revoke all on function public.expires_at(public.event_media) from public, anon;
grant execute on function public.expires_at(public.event_media) to authenticated;

-- The date the card's "kept until" line shows: the event's own expiry, before
-- any per-upload floor.
create function public.event_media_event_expires_at(p_event_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select public.event_media_expiry((select public.current_tenant_id()), p_event_id, null)
   where public.has_permission('events', 'view');
$$;

comment on function public.event_media_event_expires_at(uuid) is
  'When this event''s photos and videos expire under the current tenant''s retention setting (#1608), or null when kept indefinitely or the caller lacks events:view. A file uploaded late can expire later; expires_at(event_media) has its exact date.';

revoke all on function public.event_media_event_expires_at(uuid) from public, anon;
grant execute on function public.event_media_event_expires_at(uuid) to authenticated;

-- Every tenant's expired media, for the daily purge on the service-role client.
-- Rows of a tenant without a period have a null expiry and never match.
create function public.expired_event_media(p_now timestamptz default now())
returns table (id uuid, storage_path text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.storage_path
    from public.event_media m
   where public.event_media_expiry(m.tenant_id, m.event_id, m.uploaded_at) <= p_now
   order by m.id;
$$;

comment on function public.expired_event_media(timestamptz) is
  'Event media past its expiry at p_now, across every tenant (#1608). For the daily storage purge only: service_role.';

revoke all on function public.expired_event_media(timestamptz) from public, anon, authenticated;
grant execute on function public.expired_event_media(timestamptz) to service_role;
