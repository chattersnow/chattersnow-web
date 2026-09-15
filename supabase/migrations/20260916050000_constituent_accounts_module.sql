-- Constituent accounts, part one (#1161, epic #1160): the module a tenant opts
-- into, the staff-side permission that will gate its review queue, and a
-- read-only way for a signed-in person to find their own `people` row on the
-- public site.
--
-- The area itself is `/my` on a tenant's public host. It is not a second
-- account: one auth user serves both surfaces, so an administrator signing in
-- at `portal.<apex>` is already signed in at `www.<apex>/my` and already
-- linked to their own directory record. What differs between the two surfaces
-- is authorization, not identity -- the portal additionally requires a role,
-- the public site does not.

-- ---------------------------------------------------------------------------
-- 1. The module
-- ---------------------------------------------------------------------------

-- The first module in the catalog with default_enabled = false. Every other
-- row is true because every other module was already shipping to every tenant
-- when #900 wrote the catalog down; this one is new behaviour on a tenant's
-- public website, which is the tenant's decision to make rather than ours.
--
-- The resolution order in module_enabled_for_tenant() reads the tenant's own
-- row, then its plan's, then this default, and only then falls open to true.
-- The fail-open arm is for a module key that is not in the catalog at all, so
-- a catalog row saying false resolves to false -- checked by the integration
-- test rather than assumed, since "fails open" and "defaults to off" sound
-- like they should collide.
--
-- Deliberately off everywhere on the way in. Sign-up is open to anyone once a
-- tenant enables this, and the two definer RPCs that link an account to a
-- directory record by email match -- resolve_current_person_id() and
-- ensure_current_person() -- are still written for a world where the only way
-- to hold a session is an administrator's invite. #1162 fences those off and
-- adds the reviewed claim. Until it lands, no tenant should turn this on.
insert into public.modules (key, label, description, sort_order, default_enabled, is_core) values
  ('constituent_accounts', 'Constituent Accounts',
   'The signed-in area on the public website where a person sees their own history and keeps their own record current.',
   140, false, false);

-- Seeded for all three plans so provision_tenant(), which reads this table,
-- keeps giving a new tenant a complete set of rows. All three are false for
-- the same reason the catalog default is.
insert into public.plan_modules (plan, module_key, enabled)
select p.plan, 'constituent_accounts', false
from (values ('internal'), ('demo'), ('white_label')) as p(plan);

-- ---------------------------------------------------------------------------
-- 2. The staff-side permission
-- ---------------------------------------------------------------------------

-- Reviewing who may claim a directory record is its own job, distinct from
-- managing the directory: it decides whether an account gets to read one
-- person's giving and volunteering history, which is a different question from
-- whether a staffer may correct that person's phone number. It is also what
-- keeps this module from being a row nobody can be gated out of.
--
-- The queue itself arrives with #1162. The key is registered here so that the
-- module owns a resource from its first migration and an administrator can see
-- the entitlement before the screen exists.
insert into public.resources (key, section, label, description, sort_order, module_key) values
  ('constituent_claims', 'People', 'Constituent claims',
   'Review requests from a website account to be linked to a person in the directory.',
   132, 'constituent_accounts');

-- Only admin, the conservative default this schema uses for a new resource
-- with no obvious fit among the existing roles. An administrator can widen it
-- from Administration > Permissions once the queue exists and someone other
-- than an admin is actually working it.
--
-- Joined by role name so every tenant's admin role is covered, not just the
-- template's -- roles are per tenant since Phase 2.
insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'constituent_claims', 'manage'),
  ('event_coordinator', 'constituent_claims', 'none'),
  ('finance', 'constituent_claims', 'none'),
  ('board', 'constituent_claims', 'none'),
  ('volunteer', 'constituent_claims', 'none')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;

-- ---------------------------------------------------------------------------
-- 3. Finding yourself on the public site
-- ---------------------------------------------------------------------------

-- my_person_id() (20260906140000) answers for current_tenant_id(), which
-- resolves through tenant_memberships -- and a constituent has none. A person
-- who has never worked for the organization is not a member of it in any sense
-- this schema means, so on the existing function they read null and every
-- policy written against it comes back empty.
--
-- The alternative was to give them a membership row. That table's own comment
-- says it "grants access to an entire tenant's data", and it has exactly two
-- roles, `member` and the time-boxed `support` grant reserved for platform
-- staff. Adding a third, deliberately powerless one would mean re-auditing
-- every predicate that today means "is a member" -- a large, quiet blast
-- radius for what is really a reading question. So the tenant comes from the
-- request host instead, the same way it does for every other public-site read,
-- and a constituent needs no membership at all.
--
-- Three things this function is not:
--
--   * It never writes. resolve_current_person_id() and ensure_current_person()
--     both link auth_user_id on the way past, by email match, with no review.
--     That is the behaviour #1162 exists to replace, so the constituent path
--     gets a reader and nothing else: an account that has not been through the
--     claim finds nothing here, which is the correct answer rather than a gap.
--
--   * It grants nothing. The row it can find is one whose auth_user_id already
--     equals the caller's, which only a reviewed claim (or the portal's own
--     onboarding, for staff) can have set. Definer purely so that the lookup
--     does not depend on the people select policy, which requires people:view
--     -- a permission the person reading their own record has no reason to
--     hold.
--
--   * It is not a way to reach another tenant. public_tenant_id() can be
--     steered by the x-tenant-slug header on a public API request, but the
--     predicate below still pins auth_user_id to the caller: the worst a
--     steered tenant can do is select among the caller's *own* linked records,
--     of which there is at most one per tenant (people_auth_user_id_key is
--     unique on (tenant_id, auth_user_id) since 20260906020000).
create function public.my_public_person_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
    from public.people p
   where p.auth_user_id = auth.uid()
     and p.tenant_id = public.public_tenant_id()
   limit 1;
$$;

comment on function public.my_public_person_id() is
  'The caller''s people.id in the tenant the request host resolves to, or null (#1161). Read-only counterpart to my_person_id() for the public site, where the caller has no tenant membership and therefore no current_tenant_id(). Never links an account to a record: only a reviewed claim (#1162) does that.';

revoke execute on function public.my_public_person_id() from public, anon;
grant execute on function public.my_public_person_id() to authenticated, service_role;
