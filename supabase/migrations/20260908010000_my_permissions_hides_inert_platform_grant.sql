-- #795 Phase 1: stop reporting `platform_tenants` to a caller who cannot use it.
--
-- 20260906180000_platform_tenant_admin.sql granted `platform_tenants:manage` to
-- *every* tenant's `admin` role, on the reasoning that the grant is inert
-- outside the internal tenant -- is_platform_operator() requires the plan too,
-- so a customer's admin holding it reaches nothing. That is true of the RPCs
-- and stayed true here.
--
-- What it missed is that the nav is built from my_permissions(), which reported
-- the inert grant as `manage`. So the moment Chatter Snow moved to the
-- `white_label` plan (#795 Phase 1), its admins kept an Administration >
-- Platform entry that renders "Could not load tenants" -- the database refusing
-- them, correctly, one click too late. Every white-label customer's admin would
-- have had the same dead entry advertising the platform's own control panel.
--
-- The fix is here rather than in the nav because my_permissions() is what every
-- surface reads: the sidebar, the command palette, breadcrumbs, the
-- /administration section index, and requirePermission() in the route's own
-- layout, which now redirects to the dashboard with the usual "denied"
-- explanation instead of rendering a page whose every action is refused.
--
-- Deliberately NOT changed: has_permission(). is_platform_operator() calls it,
-- so suppressing there would recurse. The distinction is exactly right anyway
-- -- the grant genuinely exists in the caller's matrix, and Administration >
-- Permissions still shows it as a row someone set; what changes is only what
-- the caller's *effective* permissions say they can reach.

create or replace function public.my_permissions()
returns table (resource_key text, level text)
language sql
security definer
set search_path = public
stable
as $$
  select res.key, case
    when exists (select 1 from public.deactivated_users du where du.user_id = auth.uid())
    then 'none'
    -- `is not true` rather than `not`: current_membership_kind() is null for a
    -- caller with no membership, which makes is_platform_operator() null, and
    -- `not null` is null -- a WHEN that never fires, failing open. Wrapped in a
    -- scalar subquery so it is an InitPlan evaluated once, not once per
    -- resource row.
    when res.key = 'platform_tenants'
     and (select public.is_platform_operator()) is not true
    then 'none'
    else coalesce(
      (select rp.level
       from public.user_roles ur
       join public.role_permissions rp on rp.role_id = ur.role_id and rp.resource_id = res.id
       where ur.user_id = auth.uid()
         and ur.tenant_id = (select public.current_tenant_id())
       order by public.permission_rank(rp.level) desc
       limit 1),
      'none'
    )
  end
  from public.resources res
  order by res.sort_order, res.key;
$$;

comment on function public.my_permissions() is
  'The caller''s effective permission level per resource, in the tenant they are looking at. platform_tenants reports `none` unless is_platform_operator() holds, so the nav never offers a page the platform RPCs will refuse.';
