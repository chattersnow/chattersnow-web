-- Event media: the Media card's gallery (#1607, part of #1605).
--
--   1. uploader_name(event_media), a computed column, so the video list can
--      say who uploaded a file without the reader holding people:view.
--   2. event_media_summary(), the card's three numbers in one round trip: how
--      much this event's media takes up, how much the tenant's does, and how
--      many registrants of the event objected to being photographed.
--
-- Deleting needs nothing here: 20261020130000 already gave events:manage the
-- delete policy on both the bucket and the table.

-- ---------------------------------------------------------------------------
-- 1. Who uploaded a file
-- ---------------------------------------------------------------------------

-- author_name(event_retro_items)'s rule (20261011190000): the uploader's
-- person record in this tenant, else the name on their account. Definer,
-- because people and auth.users are not readable by every events:view holder;
-- it answers only for a row of the caller's own tenant, and the row itself is
-- reachable only through event_media's select policy.
create function public.uploader_name(public.event_media)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
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
  'The display name of whoever uploaded an event photo or video (#1607): their person record in the tenant, else the name on their account, else null. Answers only for a row of the caller''s own tenant.';

revoke all on function public.uploader_name(public.event_media) from public, anon;
grant execute on function public.uploader_name(public.event_media) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The card's numbers
-- ---------------------------------------------------------------------------

-- Invoker on purpose: every number is a sum or count over rows the caller can
-- already select (event_media and event_registrations both at events:view),
-- so RLS is what scopes it and a caller without events:view gets zeros.
--
-- photo_objections counts registrations with photo_consent = false, which is
-- the one state that means "objected" (20260923020000). A cancelled
-- registration is not counted: that person is not coming.
create function public.event_media_summary(p_event_id uuid)
returns table (
  event_bytes bigint,
  tenant_bytes bigint,
  photo_objections integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce((select sum(m.size_bytes)
                from public.event_media m
               where m.tenant_id = (select public.current_tenant_id())
                 and m.event_id = p_event_id), 0)::bigint,
    coalesce((select sum(m.size_bytes)
                from public.event_media m
               where m.tenant_id = (select public.current_tenant_id())), 0)::bigint,
    (select count(*)
       from public.event_registrations r
      where r.tenant_id = (select public.current_tenant_id())
        and r.event_id = p_event_id
        and r.photo_consent = false
        and r.cancelled_at is null)::integer;
$$;

comment on function public.event_media_summary(uuid) is
  'The event''s Media card numbers (#1607): bytes stored for this event, bytes stored for the tenant''s event media, and how many active registrations of the event objected to being photographed (photo_consent = false). Security invoker: RLS on event_media and event_registrations scopes every figure.';

revoke all on function public.event_media_summary(uuid) from public, anon;
grant execute on function public.event_media_summary(uuid) to authenticated;
