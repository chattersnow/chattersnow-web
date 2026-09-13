-- Issue #1059: the "who receives each kind" card named an address nothing
-- sends to.
--
-- Delivery is coalesce(notification_email, email) (#1042). people.email is an
-- identity key first and a mailbox second -- sign-in binds an account to a
-- directory record on it -- so somebody who signs in with a personal account
-- moves their mail with the override rather than by changing what identifies
-- them. Both existing implementations of that rule agree: deliveryAddress()
-- in src/lib/notifications/delivery-address.ts for senders holding a session,
-- and people_with_permission() (20260914010000) for the sessionless ones that
-- cannot reach it.
--
-- notification_recipients() (20260914020000) did not. It joins people for the
-- display fields and returned the raw column, which the panel renders verbatim
-- as "Name (address)", so an administrator was shown a person's *sign-in*
-- address while their mail went elsewhere. That is the gap #1044 exists to
-- close, one column over: a card whose whole job is making the recipient rule
-- legible disagreed with the rule.
--
-- The role-holder half already has the right value to hand -- people_with_permission()
-- returns the coalesce as its own `email` -- but the opted-in-only half comes
-- from person_notification_preferences and still needs this join, so the fix is
-- the coalesce here rather than a different source.
--
-- notification_email_pending (20260914030000) is deliberately not consulted:
-- no sender reads it either, and an address the person has not yet proven they
-- hold is not where their mail goes today.
--
-- Body is 20260914020000's verbatim apart from that one column. `create or
-- replace` rather than a drop: the return type is unchanged.

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
         -- The delivery address, not the identity one (#1059). Same rule as
         -- people_with_permission() and deliveryAddress().
         coalesce(p.notification_email, p.email)::text,
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
   -- Tiebreaker on the address that is actually shown, so two people sharing
   -- a name order the way the card reads.
   order by c.spec_kind, coalesce(p.preferred_name, p.name),
            coalesce(p.notification_email, p.email);
end $$;

-- Says which address, because the two are the same for most rows and the
-- difference will not show up in casual testing.
comment on function public.notification_recipients(jsonb) is
  'Per kind and person: whether they hold the role that receives it, whether they opted in, and therefore whether they receive it. The address is the delivery address, coalesce(notification_email, email), the same rule people_with_permission() and deliveryAddress() apply -- not the sign-in address. Administration:manage only, scoped to current_tenant_id(). Takes the kind/resource/level mapping from src/lib/notifications/kinds.ts so adding a kind stays a TypeScript change.';

-- No revoke/grant: `create or replace` keeps the privileges 20260914020000 set,
-- and reasserting them here would only invite them to drift apart.
