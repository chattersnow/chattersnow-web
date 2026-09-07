-- #759: a tenant admin could mint a magic link for any account they knew the
-- address of, and sign in as it.
--
-- Three pieces, each defensible alone:
--
--   1. The `pending_role_grants` "admin manage" policy (20260906030000)
--      constrains which *tenant* a staged grant lands in. Nothing constrains
--      the `email` column, so an admin may stage a grant for an address that
--      has nothing to do with their organization.
--   2. createInviteLinkAction mints `generateLink({type: 'invite'})` as
--      service_role and, when GoTrue answers `email_exists`, retries as
--      `magiclink` and hands the caller the token.
--   3. /auth/confirm verifyOtp()s that token into a session and lands on
--      /portal/set-password.
--
-- So: stage a grant for someone@chattersnow.org, click "Create invite link",
-- open it, and you are signed in as them on the page that changes their
-- password.
--
-- The fallback exists for a good reason -- re-inviting somebody who already has
-- an account should not dead-end on `email_exists` -- and the defect is that it
-- does not distinguish "this address already has an account because I invited
-- them here" from "this address already has an account somewhere else".
--
-- Not exploitable today: one tenant, and its admins can already reach that data
-- directly. It becomes cross-tenant account takeover with the second tenant,
-- which is why it lands before the demo tenant (#707 Phase 5d), where the admin
-- is an anonymous visitor.
--
-- This function is the check. The app calls it before minting; the policy below
-- also refuses to stage such an address in the first place, so the hazard
-- cannot be re-created by a future caller of the table. The app-side check is
-- the load-bearing one -- a grant staged before this migration is still in the
-- table -- and the policy is what stops new ones.

create or replace function public.email_is_this_tenants_to_invite(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  -- True in exactly two cases, and the second is why this is a targeted check
  -- rather than "refuse every address that already has an account":
  --
  --   * no account exists -- `invite` will create one, and
  --     claim_pending_role_grants() puts it in the tenant the grant was staged
  --     in, so there is nothing to take over;
  --   * an account exists and holds a live membership in THIS tenant -- the
  --     ordinary re-invite, which is what the magic-link fallback was written
  --     for. Signing them in is signing in someone this tenant already has.
  --
  -- Everything else is false: an account belonging to another organization,
  -- and -- the case worth spelling out -- an account with no membership at
  -- all. That is not an unclaimed address; it is somebody who has signed in
  -- once and is waiting on a grant (the "no organization" screen), and a
  -- magic link to it is a session as them.
  select not exists (
    select 1 from auth.users u
    where lower(u.email) = lower(btrim(coalesce(p_email, '')))
  )
  or exists (
    select 1
    from auth.users u
    join public.tenant_memberships m on m.user_id = u.id
    where lower(u.email) = lower(btrim(coalesce(p_email, '')))
      and m.tenant_id = (select public.current_tenant_id())
      and (m.expires_at is null or m.expires_at > now())
  );
$$;

comment on function public.email_is_this_tenants_to_invite(text) is
  'Whether a sign-in link may be minted for an address: it has no account, or its account is already a live member of the caller''s tenant. #759 -- for anything else the magic-link fallback would hand the caller a session as somebody else.';

revoke execute on function public.email_is_this_tenants_to_invite(text) from public;
grant execute on function public.email_is_this_tenants_to_invite(text) to authenticated;

-- The staging half.
--
-- Split out of the single `for all` policy rather than added to it, and the
-- reason is worth recording because it is not obvious: `with check` on a
-- `for all` policy governs UPDATE as well as INSERT, and the invite flow
-- legitimately makes the address fail the test *between* the insert and the
-- update. `generateLink({type: 'invite'})` creates the auth account, so by the
-- time createInviteLinkAction stamps invited_at the address has an account
-- with no membership yet -- and the update was refused.
--
-- So: the tenant predicate everywhere (it is what tenant_isolation_gaps()
-- checks for), and the address test on INSERT alone. Reading, stamping and
-- revoking an already-staged grant keep working, which they must -- a tenant
-- has to be able to clean up exactly the rows this is about.
drop policy "admin manage pending_role_grants" on public.pending_role_grants;

create policy "admin reads pending_role_grants" on public.pending_role_grants
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

create policy "admin stages pending_role_grants" on public.pending_role_grants
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
    and public.email_is_this_tenants_to_invite(email)
  );

create policy "admin updates pending_role_grants" on public.pending_role_grants
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

create policy "admin deletes pending_role_grants" on public.pending_role_grants
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('administration', 'manage')
  );

-- Same self-check 20260906100000 runs, because this migration rewrote a policy.
do $$
declare
  v_gaps text;
begin
  with tenant_tables as (
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  gaps as (
    select 'policy ' || p.tablename || '."' || p.policyname || '"' as gap
    from pg_policies p
    join tenant_tables t on t.relname = p.tablename
    where p.schemaname = 'public'
      and coalesce(p.qual, '') !~ 'tenant_id'
      and coalesce(p.with_check, '') !~ 'tenant_id'
      and not (p.tablename = 'user_roles' and p.policyname = 'user views own roles')
    union all
    select 'fk ' || ch.relname || '.' || c.conname
    from pg_constraint c
    join tenant_tables ch on ch.oid = c.conrelid
    join tenant_tables pa on pa.oid = c.confrelid
    join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
    where c.contype = 'f'
      and array_length(c.conkey, 1) = 1
      and fa.attname = 'id'
  )
  select string_agg(gap, ', ') into v_gaps from gaps;

  if v_gaps is not null then
    raise exception 'Tenant isolation gaps remain: %', v_gaps;
  end if;
end $$;
