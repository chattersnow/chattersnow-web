-- Issue #742: who should be told about an inbound public submission.
--
-- The event-triggered sends run on the service-role client from a Server
-- Action with no session -- a volunteer application and a contact message are
-- both filed by an anonymous visitor -- and they have to answer a question
-- nothing in the schema could answer before: "which people in *this* tenant
-- hold this permission?"
--
-- Neither of the two obvious candidates works.
--
--   has_permission(resource, level) (20260906030000) is bound to auth.uid()
--   and current_tenant_id(). It answers "may I", never "who else may", and in
--   a sessionless caller both are null.
--
--   people_with_roles (20260903030000) sounds like the right view and is not:
--   its flags are *directory* roles -- is_donor, is_sponsor, is_volunteer,
--   is_attendee, is_staff, is_partner -- derived from donation and event
--   history. A person can be is_volunteer without holding a portal account at
--   all. Portal authorization lives in user_roles x role_permissions.
--
-- So: has_permission's own join, lifted to answer for every person in one
-- named tenant at once. The tenant is a parameter rather than
-- current_tenant_id() precisely because the caller has no session; passing it
-- is what keeps one organization's applications out of another's inbox, and
-- there is no RLS underneath a service-role query to catch a mistake.
--
-- p_resource_keys is an array because the question a caller actually asks is a
-- union: contact messages go to whoever owns the ops inbox, which is
-- communications *or* administration. The `having max(...)` below reads the
-- highest level the person reaches across all of them, which is the same thing
-- has_permission does across a person's several roles.

create or replace function public.people_with_permission(
  p_tenant_id uuid,
  p_resource_keys text[],
  p_min_level text
)
returns table (
  person_id uuid,
  tenant_id uuid,
  email text,
  name text,
  preferred_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.tenant_id, p.email, p.name, p.preferred_name
    from public.people p
    -- Composite on both joins: a role grant only counts inside the tenant the
    -- person belongs to, so a membership elsewhere can never elect someone
    -- into this tenant's recipients.
    join public.user_roles ur
      on ur.user_id = p.auth_user_id
     and ur.tenant_id = p.tenant_id
    join public.role_permissions rp
      on rp.role_id = ur.role_id
     and rp.tenant_id = ur.tenant_id
    -- resources is the global permission catalog and carries no tenant_id
    -- (20260906010000 lists it among the tables deliberately left unscoped).
    join public.resources res
      on res.id = rp.resource_id
   where p.tenant_id = p_tenant_id
     and res.key = any(p_resource_keys)
     -- Both required, and for different reasons: without an address there is
     -- nowhere to send, and without an account the portal link the message is
     -- built around is useless. `people` is a directory full of donors and
     -- sponsors who have neither.
     and p.email is not null
     and p.auth_user_id is not null
     and not exists (
       select 1 from public.deactivated_users du
        where du.user_id = p.auth_user_id
     )
     -- Not something has_permission does, and deliberate. grant_support_access
     -- (20260906110000) writes a real user_roles row in the customer's tenant,
     -- and platform staff who open the portal acquire a people row there via
     -- ensure_current_person(). A support grant is for looking at a problem on
     -- request; it is not consent to receive that organization's inbound mail.
     and not exists (
       select 1 from public.tenant_memberships tm
        where tm.user_id = p.auth_user_id
          and tm.tenant_id = p.tenant_id
          and tm.kind = 'support'
     )
   group by p.id, p.tenant_id, p.email, p.name, p.preferred_name
  having max(public.permission_rank(rp.level)) >= public.permission_rank(p_min_level);
$$;

comment on function public.people_with_permission(uuid, text[], text) is
  'People in one named tenant whose portal roles reach p_min_level on any of p_resource_keys. Sessionless counterpart to has_permission(), which can only answer for auth.uid(). Unrelated to people_with_roles, which is the directory role view.';

-- Postgres grants execute to PUBLIC by default, so the revoke is the actual
-- access control here, not decoration (same shape as
-- generate_volunteer_reference_code, 20260906060000). Enumerating who holds
-- which permission is a service-role concern: a signed-in session that wants
-- to know its own answer already has has_permission(), and the administration
-- screens read the matrix directly under their own policies.
revoke execute on function public.people_with_permission(uuid, text[], text) from public, anon, authenticated;
grant execute on function public.people_with_permission(uuid, text[], text) to service_role;
