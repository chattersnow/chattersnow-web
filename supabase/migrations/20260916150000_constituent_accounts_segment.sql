-- Who holds an account, and how to take one away (#1193, epic #1160).
--
-- #1192 left the read model able to say *that* a person has an account
-- (`people_with_roles.has_account`) and which door it opens
-- (`has_portal_access`). Two things it did not leave: the account's own
-- address, which is what tells a staffer the person signs in as somebody else
-- entirely, and any way to undo a link.
--
-- Both are constrained by the same fact: `auth.users` is not readable from the
-- client, and the one thing that reads it today -- `list_portal_users()` -- is
-- gated on `is_admin()`. A claims reviewer is not necessarily an administrator
-- (`constituent_claims` was deliberately given its own resource in section
-- People, 20260916050000), so neither the Accounts segment nor an unlink on the
-- person record can be built on it.

-- ---------------------------------------------------------------------------
-- 1. The account's address, as a column
-- ---------------------------------------------------------------------------

-- A PostgREST computed column on the view: a function of
-- `public.people_with_roles`'s composite type is selectable as `account_email`
-- on that view, exactly the way `primary_contact()` already is. It is selected
-- by the Accounts segment and by the person detail page, and by nothing else,
-- so no other directory read pays for it.
--
-- **A migration that drops `people_with_roles` has to drop this first and put
-- it back after**, the way 20260916130000 did for `primary_contact()`. That is
-- the price of the computed-column shape and it is worth paying here: the
-- alternative is a second round trip per page of rows.
--
-- `security definer` to reach `auth.users`, and therefore gated in its own
-- body. `has_permission()` folds the module entitlement in (20260910010000), so
-- a tenant with `constituent_accounts` off reads null here for everyone --
-- which is the same answer a reader without the permission gets, and the right
-- one.
create function public.account_email(public.people_with_roles)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select u.email::text
    from auth.users u
   where u.id = $1.auth_user_id
     and $1.tenant_id = (select public.current_tenant_id())
     and public.has_permission('constituent_claims', 'view');
$$;

grant execute on function public.account_email(public.people_with_roles) to authenticated;

comment on function public.account_email(public.people_with_roles) is
  'The sign-in address of the account linked to this person (#1193), or null for a reader without constituent_claims:view, for a tenant with the constituent area off, and for a row outside the current tenant.';

-- ---------------------------------------------------------------------------
-- 2. Taking a link away
-- ---------------------------------------------------------------------------

-- The one write this ticket adds, and the one with real consequences: the
-- linked account reads that record's giving, volunteering and gear history at
-- `/my`, so clearing the column is what stops it.
--
-- Deliberately refuses an account that holds a role in this tenant. A staffer's
-- `auth_user_id` is what `ensure_current_person()` wrote on their first portal
-- sign-in and what the portal identifies them by; detaching it is an
-- Administration act against a member of the team, not a claims one against a
-- member of the public. Administration > Users already owns that.
--
-- Audited by hand, because `people` deliberately carries no audit trigger:
-- #18 declined to put every import and registration upsert into the trail, and
-- 20260916080000 registered the table without one so that the definer functions
-- which *are* decisions could attribute themselves. This is one of those. What
-- it records is the account that was detached and nothing else -- the same
-- restraint `person_self_edit_snapshot()` shows, and for the same reason: an
-- audit trail should not become the second place a person's details live.
create function public.unlink_person_account(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_auth_user_id uuid;
begin
  if not public.has_permission('constituent_claims', 'manage') then
    raise exception 'Not authorized';
  end if;

  select p.auth_user_id into v_auth_user_id
    from public.people p
   where p.id = p_person_id
     and p.tenant_id = v_tenant_id
     for update;

  if not found then
    raise exception 'No such person in this organization';
  end if;

  if v_auth_user_id is null then
    raise exception 'This record has no account linked to it';
  end if;

  if public.person_portal_access(p_person_id) then
    raise exception 'That account can sign in to the portal. Remove its access from Administration > Users first.';
  end if;

  update public.people
     set auth_user_id = null
   where id = p_person_id;

  insert into public.audit_log
    (tenant_id, table_name, record_id, action, actor_id, old_data, new_data)
  values
    (v_tenant_id, 'people', p_person_id, 'update', (select auth.uid()),
     jsonb_build_object('auth_user_id', v_auth_user_id),
     jsonb_build_object('auth_user_id', null));
end;
$$;

grant execute on function public.unlink_person_account(uuid) to authenticated;

comment on function public.unlink_person_account(uuid) is
  'Detaches a website account from a directory record (#1193), so it stops seeing that record at /my. Needs constituent_claims:manage, and refuses an account that holds a role in this tenant.';
