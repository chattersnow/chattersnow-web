-- Issue #1044: who receives each kind of email, for an administrator to read.
--
-- The answer is not "who opted in". An event-triggered send
-- (src/lib/notifications/submission-notifications.ts) mails the intersection of
-- two sets -- the people who hold the role for that kind, and the people who
-- turned that kind on for themselves -- so a person opted in without the role
-- silently gets nothing, and a role holder who never opted in is silently
-- missing. Neither gap was visible anywhere in the portal.
--
-- Both halves are already in the database and neither is reachable from a
-- signed-in session on its own:
--
--   person_notification_preferences' select policy (20260906140000) admits
--   administration:manage, so the opt-ins are readable -- but only the opt-ins.
--
--   people_with_permission() (20260906200000) is the role half, and it is the
--   recipient rule the senders themselves call. It is granted to service_role
--   only, because enumerating who holds which permission is not something an
--   arbitrary session should be able to do. This function is security definer
--   and owned by the same role, so it may call it on an administrator's behalf
--   after checking that they are one.
--
-- The kinds and their requirements arrive as jsonb rather than being written
-- out here, because src/lib/notifications/kinds.ts is the source of truth for
-- that mapping and promises that adding a kind is a TypeScript change, not a
-- migration. Each element is {kind, resources?, level?}; an element with no
-- `resources` is a kind with no role requirement (the task digest), where
-- everyone who opted in receives it.

create or replace function public.notification_recipients(p_kinds jsonb)
returns table (
  kind text,
  person_id uuid,
  name text,
  preferred_name text,
  email text,
  opted_in boolean,
  holds_role boolean,
  receives boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
-- Every output column above is also a plpgsql variable in here, and the query
-- below names real columns called kind, person_id, name and email. Resolve in
-- favour of the column; the OUT parameters are assigned positionally by
-- `return query` and are never read by name.
#variable_conflict use_column
declare
  v_tenant_id uuid := public.current_tenant_id();
begin
  -- The gate, not decoration: this function reads every person's address and
  -- every person's opt-in across the tenant.
  if v_tenant_id is null
     or not public.has_permission('administration', 'manage') then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return query
  with spec as (
    select k->>'kind' as spec_kind,
           case
             when jsonb_typeof(k->'resources') = 'array'
               then array(select jsonb_array_elements_text(k->'resources'))
             else null
           end as resources,
           coalesce(k->>'level', 'manage') as level
      from jsonb_array_elements(coalesce(p_kinds, '[]'::jsonb)) as k
     where k->>'kind' is not null
  ),
  -- Only for the kinds that have a requirement. A kind without one has no role
  -- set to show -- listing every person in the directory under "holds the role"
  -- would be a list of donors, not of recipients.
  role_holders as (
    select s.spec_kind, w.person_id
      from (select * from spec where resources is not null) s
      cross join lateral public.people_with_permission(
        v_tenant_id, s.resources, s.level
      ) w
  ),
  opted as (
    select s.spec_kind, pref.person_id
      from spec s
      join public.person_notification_preferences pref
        on pref.kind = s.spec_kind
       and pref.tenant_id = v_tenant_id
       and pref.enabled
  ),
  candidates as (
    select spec_kind, person_id from role_holders
    union
    select spec_kind, person_id from opted
  )
  select c.spec_kind::text,
         c.person_id,
         p.name::text,
         p.preferred_name::text,
         p.email::text,
         o.person_id is not null,
         rh.person_id is not null or s.resources is null,
         o.person_id is not null
           and (rh.person_id is not null or s.resources is null)
    from candidates c
    join spec s on s.spec_kind = c.spec_kind
    -- The tenant predicate again, on a security definer function with no RLS
    -- underneath it: both halves above are already scoped, and this is what
    -- makes that verifiable from the join alone.
    join public.people p
      on p.id = c.person_id
     and p.tenant_id = v_tenant_id
    left join role_holders rh
      on rh.spec_kind = c.spec_kind
     and rh.person_id = c.person_id
    left join opted o
      on o.spec_kind = c.spec_kind
     and o.person_id = c.person_id
   order by c.spec_kind, coalesce(p.preferred_name, p.name), p.email;
end $$;

comment on function public.notification_recipients(jsonb) is
  'Per kind and person: whether they hold the role that receives it, whether they opted in, and therefore whether they receive it. Administration:manage only, scoped to current_tenant_id(). Takes the kind/resource/level mapping from src/lib/notifications/kinds.ts so adding a kind stays a TypeScript change.';

-- Postgres grants execute to PUBLIC by default, so the revoke is the access
-- control, not the grant (same shape as people_with_permission itself).
revoke execute on function public.notification_recipients(jsonb) from public, anon;
grant execute on function public.notification_recipients(jsonb) to authenticated;
