-- Follows 20260902010000, which repointed calendar_items.owner_id and
-- content_opportunities.owner_id/reviewer_id at public.people. The owner
-- picker's RPC still returns auth ids and emails, so replace it.
--
-- Two changes, one structural and one a bug fix:
--
-- 1. Shape. Returns people rows now, with the name fields the UI actually
--    wants. auth_user_id comes back alongside person_id so the same array
--    also resolves the audit stamps that deliberately stayed on auth.users
--    (content_opportunities.status_changed_by, calendar_items.
--    sensitive_review_by) -- one fetch, no second lookup RPC.
--
-- 2. Gate. The old body self-restricted to
--    `has_role('admin') or has_role('event_coordinator')`, but finance, board
--    and volunteer all hold content_calendar:view
--    (20260824000000_create_calendar_items.sql) and resolve owner names from
--    this same array. They have been getting an empty array and rendering
--    "--" for every owner. Gate on the resource permission instead, exactly
--    as list_expense_actors does (20260830130000) for the same reason.
--    The *candidate* restriction -- only admins and event coordinators may be
--    a calendar owner -- is unchanged; it now lives in the exists() clause
--    where it belongs, rather than being conflated with who may read the list.
--
-- Note this is a drop + recreate, not CREATE OR REPLACE: changing the
-- RETURNS TABLE output list otherwise errors with "cannot change return type
-- of existing function" (see 20260824220000 and 20260824230000, which hit
-- this twice on list_portal_users).
--
-- Deactivated accounts are NOT filtered out, matching current behaviour:
-- excluding them would blank the owner name on every historical item they
-- still own.

drop function if exists public.list_calendar_owners();

create function public.list_calendar_owners()
returns table (
  person_id uuid,
  auth_user_id uuid,
  name text,
  preferred_name text,
  email text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.auth_user_id, p.name, p.preferred_name, p.email
  from public.people p
  where p.auth_user_id is not null
    and public.has_permission('content_calendar', 'view')
    and exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = p.auth_user_id
        and r.name in ('admin', 'event_coordinator')
    )
  order by coalesce(p.preferred_name, p.name, p.email);
$$;

grant execute on function public.list_calendar_owners() to authenticated;
