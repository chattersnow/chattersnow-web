-- Two facts where the portal had one (#1192, epic #1160).
--
-- `people.auth_user_id` used to mean one thing: an administrator had linked a
-- staff account to this record, so "has an account" and "can use the portal"
-- were the same sentence. Since #1162 they are not -- review_person_claim()
-- writes auth_user_id for every approved constituent, and a constituent holds
-- no role and cannot open the portal at all. The "Portal user" badge therefore
-- says the opposite of the truth about the larger of the two groups.
--
-- Splitting the badge needs a fact the read model does not carry: does the
-- account linked to this row hold a role in this tenant. That cannot be asked
-- from the client -- `user_roles` is readable only by an admin or by the
-- account itself (20260906030000) -- and it must not be a second query per
-- row, because the loudest caller is the person picker every staffer opens.
-- So it becomes a column, exposed twice:
--
--   * `people_with_roles.has_portal_access`, for the directory and the person
--     detail page, which already read the view;
--   * a computed column on `people` for the picker, which reads the table and
--     would otherwise have to pay for the seven role flags to learn one
--     boolean.
--
-- Both delegate to one function, so the question has a single definition.
--
-- `has_account` lands here too rather than in its own migration: #1193's
-- Accounts segment filters on it, the segment strip filters on boolean
-- columns, and `auth_user_id is not null` is not one.

-- ---------------------------------------------------------------------------
-- 1. The fact
-- ---------------------------------------------------------------------------

-- Keyed on the person rather than on the auth user, and tenant-scoped the same
-- way person_role_flags() is (20260906090000): security definer bypasses RLS,
-- so asked about another tenant's person it must answer false rather than
-- report on a row the caller cannot see.
--
-- Deliberately *not* folded in: deactivation. `deactivated_users` is
-- platform-wide rather than per-tenant (20260824230000), and a suspended
-- staffer is a staffer whose access was suspended, not a member of the public
-- -- calling them a "Website account" would be the same class of mistake this
-- migration exists to fix. Administration > Users is where a deactivation is
-- reported, and it still reports it.
create function public.person_portal_access(p_person_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
parallel safe
as $$
  select exists (
    select 1
    from public.people p
    join public.user_roles ur on ur.user_id = p.auth_user_id
    where p.id = p_person_id
      and p.tenant_id = (select public.current_tenant_id())
      and ur.tenant_id = (select public.current_tenant_id())
  );
$$;

grant execute on function public.person_portal_access(uuid) to authenticated;

comment on function public.person_portal_access(uuid) is
  'Does the account linked to this person hold at least one role in the current tenant (#1192)? False for a person with no linked account, for a constituent whose account holds no role, and for a person outside the current tenant.';

-- ---------------------------------------------------------------------------
-- 2. The view, carrying both columns
-- ---------------------------------------------------------------------------

-- Adding a column to the view means dropping it and the computed relationship
-- built on its type, then putting both back -- the sequence 20260905020000
-- established and 20260916020000 last followed. The body below is
-- 20260916080000's, which is the current one, plus the two new columns.
drop function public.primary_contact(public.people_with_roles);
drop view public.people_with_roles;

create view public.people_with_roles
with (security_invoker = true) as
select
  p.*,
  f.is_donor,
  f.is_sponsor,
  f.is_volunteer,
  f.is_attendee,
  f.is_staff,
  f.is_partner,
  f.is_recipient,
  p.auth_user_id is not null as has_account,
  public.person_portal_access(p.id) as has_portal_access
from public.people p
cross join lateral public.person_role_flags(p.id) f;

grant select on public.people_with_roles to authenticated;

create function public.primary_contact(public.people_with_roles)
returns setof public.people
rows 1
language sql
stable
as $$
  select * from public.people where id = $1.primary_contact_person_id;
$$;

grant execute on function public.primary_contact(public.people_with_roles) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The same column on the table, for the picker
-- ---------------------------------------------------------------------------

-- A PostgREST computed column: a function of the table's composite type is
-- selectable as `has_portal_access` on `people`, the way primary_contact() is
-- on the view. It exists so listPeopleAction() can keep reading `people` --
-- reading the view instead would run person_role_flags() over every person in
-- the tenant, fifteen exists() probes a row, to render one badge.
create function public.has_portal_access(public.people)
returns boolean
language sql
stable
as $$
  select public.person_portal_access($1.id);
$$;

grant execute on function public.has_portal_access(public.people) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The third surface: the duplicate-merge list
-- ---------------------------------------------------------------------------

-- People > Duplicates carried its own inline copy of the old badge, telling a
-- staffer deciding which of two records survives that one of them is a "portal
-- user". That is the same claim as the badge and wrong in the same way, and it
-- is the one place where acting on it deletes a record -- so the RPC behind it
-- returns the fact too, and the page renders the shared component.
--
-- A return type change, so the function comes down rather than being replaced.
-- Body is 20260906050000's, which is the current one.
drop function public.find_duplicate_people();

create function public.find_duplicate_people()
returns table (
  email_key text, id uuid, name text, preferred_name text, person_type text,
  email text, auth_user_id uuid, created_at timestamptz,
  has_portal_access boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('people', 'manage') then
    raise exception 'Not authorized';
  end if;

  return query
    select lower(p.email), p.id, p.name, p.preferred_name, p.person_type,
           p.email, p.auth_user_id, p.created_at,
           public.person_portal_access(p.id)
      from public.people p
     where p.email is not null
       and not p.is_anonymous
       and p.tenant_id = (select public.current_tenant_id())
       and exists (
         select 1 from public.people q
          where q.id <> p.id
            and q.tenant_id = p.tenant_id
            and not q.is_anonymous
            and lower(q.email) = lower(p.email)
       )
     order by lower(p.email), p.created_at;
end;
$$;

grant execute on function public.find_duplicate_people() to authenticated;
