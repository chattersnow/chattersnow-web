-- Opening the portal stops making you a member of the tenant (#1191).
--
-- ensure_tenant_membership() joined any signed-in account holding no membership
-- anywhere to the tenant the request host resolves to. It was written in
-- September 2026 (20260905180000, re-pointed at the host in 20260906060000),
-- when "an account that belongs to nobody yet" could only mean a new staffer
-- on their first sign-in. Since #1161 a constituent signs in with the same
-- account on both hosts, so a member of the public who opened /portal out of
-- curiosity was given a real tenant_memberships row and an audit entry on the
-- way to being correctly refused -- which then listed them in Administration ->
-- Users with an empty role array and made current_tenant_id() answer for them.
-- 20260916060000 (person_claims) already states the rule that breaks: "A
-- constituent must never acquire a tenant membership."
--
-- Nothing legitimate needs it any more. A membership follows a role, through
-- the ensure_membership_for_role trigger on user_roles (20260906030000): an
-- invited staffer and the first admin of a provisioned tenant both arrive via
-- claim_pending_role_grants(), a bootstrap admin via the grant in
-- docs/admin-bootstrap.md, the demo tenant via scripts/demo-reset.ts, and
-- support access via grant_support_access(). Local and CI get theirs from
-- supabase/seed.sql. No SQL ever called this function; its only callers were
-- src/lib/portal/tenants.ts and src/lib/auth/permissions.ts, and both now ask
-- has_tenant_membership() instead of asking to be joined.

drop function if exists public.ensure_tenant_membership();

-- What the portal shell needs from the membership table now that it no longer
-- writes to it: the difference between "belongs to nobody" -- a constituent or
-- a stray signup, refused at /portal/login?error=no_access -- and "belongs to
-- an organization that is not currently active", which is what the NoTenant
-- page was written to explain.
--
-- Deliberately raw tenant_memberships rather than my_tenant_ids(): that helper
-- filters to active tenants and unexpired grants, which is the very distinction
-- this function exists to preserve. It answers only about the caller, so it
-- reveals nothing a session could not already infer from being let in.
create or replace function public.has_tenant_membership()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tenant_memberships tm where tm.user_id = auth.uid()
  );
$$;

comment on function public.has_tenant_membership() is
  'Whether the caller holds any tenant membership at all, ignoring tenant status and grant expiry. Tells "member of nothing" apart from "member of something inactive".';

grant execute on function public.has_tenant_membership() to authenticated;

-- A membership must not imply a read ------------------------------------------
--
-- These two were the only policies in the schema keyed on tenant alone
-- (20260906050000), which made a bare membership enough to read a tenant's
-- inventory vocabulary through PostgREST. Category labels, not donor data, but
-- it was the one place where "a membership means nothing without a role" was
-- not true.
--
-- The predicate is not inventory:view alone. The roles that need this
-- vocabulary are not the ones that hold `inventory`: an intake volunteer holds
-- inventory_intake:manage with inventory:none, and finance holds
-- inventory_reports:view with inventory:none (20260822090000), so gating on
-- inventory:view would empty the category picker for exactly the people who
-- record donations and drop category labels from finance's donation and
-- distribution views. This mirrors the sibling inventory_items select policy
-- (20260822100000), widened by the intake carve-out.
drop policy "inventory_category_groups select" on public.inventory_category_groups;
create policy "inventory_category_groups select" on public.inventory_category_groups for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      public.has_permission('inventory', 'view')
      or public.has_permission('inventory_reports', 'view')
      or public.has_permission('inventory_intake', 'view')
    )
  );

drop policy "inventory_categories select" on public.inventory_categories;
create policy "inventory_categories select" on public.inventory_categories for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      public.has_permission('inventory', 'view')
      or public.has_permission('inventory_reports', 'view')
      or public.has_permission('inventory_intake', 'view')
    )
  );

-- The rows the auto-join already wrote -----------------------------------------
--
-- Three conditions, and all three are needed to name a constituent rather than
-- a staffer:
--
--   created_by = user_id  is the auto-join's own signature: it inserted with
--     auth.uid() in both columns. ensure_membership_for_role copies the
--     granter's id, grant_support_access names the granting admin, and the
--     Phase 1 backfill (20260905190000) left created_by null because a
--     migration has no auth.uid(). So this alone spares every membership
--     written before constituent accounts existed. seed.sql does self-insert
--     the same way, which the other two conditions handle.
--
--   no user_roles row in that tenant  spares anyone who was ever granted
--     anything there, including a deactivated account (deactivation revokes
--     through deactivated_users, it does not drop the role).
--
--   a people row linked to the account in that tenant  is what makes it a
--     constituent. A staffer sitting between invite and role grant has none:
--     ensureCurrentPerson() runs in the portal layout *after* the refusal, so
--     it never ran for them. It is also why seeded noaccess@example.test
--     survives a local reset -- seed.sql deliberately gives it no people row.
delete from public.tenant_memberships tm
where tm.kind = 'member'
  and tm.created_by = tm.user_id
  and not exists (
    select 1 from public.user_roles ur
    where ur.user_id = tm.user_id and ur.tenant_id = tm.tenant_id
  )
  and exists (
    select 1 from public.people p
    where p.auth_user_id = tm.user_id and p.tenant_id = tm.tenant_id
  );
