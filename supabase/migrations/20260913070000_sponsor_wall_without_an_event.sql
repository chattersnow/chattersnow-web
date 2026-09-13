-- #1024: let a sponsor reach the public sponsor wall without an event.
--
-- #914 derived the wall (20260912090000) from `event_sponsors` alone, and
-- `event_sponsors.event_id` is `not null` (20260821010000). That was the point:
-- the wall stays current as events age out and `is_public` on the sponsorship
-- is the single opt-in, so there is no second list for staff to maintain.
--
-- It leaves one real case with nowhere to go: a sponsor who supports the
-- organization rather than an event -- an annual partner, a business funding a
-- program, a company giving cash with no event attached. Staff can already
-- assert that role by hand: `person_role_tags` is "a staff assertion with a
-- date and an author" (20260903010000), `set_person_role_tags` writes it, and
-- `people_with_roles.is_sponsor` picks it up, so the person shows in the portal
-- at /portal/people/sponsors with their logo and website filled in -- and the
-- public wall never shows them. The workaround was to publish a fake event to
-- hang a sponsorship off.
--
-- So the tag gains its own public opt-in and the wall becomes the union of the
-- two. Still derived rather than curated: this writes no new copy of a
-- sponsor's name, logo or website, which all keep coming from the one `people`
-- row.

-- 1. The opt-in ---------------------------------------------------------------

alter table public.person_role_tags
  add column is_public boolean not null default false;

-- Default false, for the reason 20260912060000 gives for `programs.is_public`:
-- a migration must never publish anyone nobody reviewed. Every tag that exists
-- today -- the seeded ones included -- backfills closed, so the wall is
-- unchanged until a staffer ticks the box.
comment on column public.person_role_tags.is_public is
  'Sponsor tags only (#1024): show this organization on the tenant''s public sponsor wall at /support/sponsorship, with no event anywhere. The second opt-in beside event_sponsors.is_public, and the only one available to a sponsor who supports the organization rather than an event. Meaningless on the other five roles, which reach no public surface; set_person_role_tags refuses a public role it was not also asked to assert.';

-- 2. The wall -----------------------------------------------------------------
--
-- Two arms, same four columns, so this is a body-only change and `create or
-- replace view` is legal -- it preserves the comment and the security_barrier
-- reloption, both of which are re-stated below anyway, as the house style does.
--
-- `distinct on` cannot span a union, so the arms are an inner subquery and the
-- one-row-per-person dedupe wraps around it. The arms cannot disagree about
-- anything the view returns: name, logo_url and website come from the same
-- `people` row either way, so the dedupe picks a row rather than a version, and
-- a sponsor who is both event-credited and hand-published appears exactly once.
--
-- `ranked_at` orders the candidates and is deliberately not an output column;
-- the public page sorts by name itself. The old tie-break on `es.id` is gone
-- with it: what it disambiguated -- two events starting at the same instant --
-- now picks between rows whose every output value is identical.
--
-- Family A of #887, as before: `event_sponsors`, `person_role_tags`, `people`
-- and `events` all say `for select to authenticated` and the public website
-- reads as `anon`, so the tenant predicate lives in the view body. Note it is
-- repeated on the new arm on purpose. tenant_isolation_gaps() matches
-- `public_tenant_id()` against the whole view definition (20260911010000
-- section 1), so it would not catch a second arm that forgot it; what proves
-- this line is the marker-row probe in tenant-isolation.integration.test.ts.
create or replace view public.public_sponsor_wall as
select distinct on (s.sponsor_id)
  s.sponsor_id,
  s.name,
  s.logo_url,
  s.website
from (
  -- Credited on a published public event (#914). Unchanged.
  select
    p.id as sponsor_id,
    p.name,
    p.logo_url,
    p.website,
    e.starts_at as ranked_at
  from public.event_sponsors es
  join public.people p on p.id = es.person_id
  join public.events e on e.id = es.event_id
  where es.is_public = true
    and e.visibility = 'public'
    and e.status = 'published'
    and e.tenant_id = public.public_tenant_id()

  union all

  -- Published by hand, no event anywhere (#1024). Organizations only: the wall
  -- is a wall of logos, `logo_url` and `website` are the organization branch of
  -- the person record, and an individual with no logo would be published to a
  -- public page as their own name on a staff tick alone.
  select
    p.id as sponsor_id,
    p.name,
    p.logo_url,
    p.website,
    t.granted_at as ranked_at
  from public.person_role_tags t
  join public.people p on p.id = t.person_id
  where t.role = 'sponsor'
    and t.is_public = true
    and p.person_type = 'organization'
    and p.tenant_id = public.public_tenant_id()
) s
order by s.sponsor_id, s.ranked_at desc nulls last;

comment on view public.public_sponsor_wall is
  'Every organization the resolved tenant has publicly credited as a sponsor, once each, for the sponsor wall on /support/sponsorship (#914, #1024). Two arms and two opt-ins: a sponsorship marked is_public on a published public event, and -- for a sponsor who supports the organization rather than an event -- a person_role_tags sponsor assertion marked is_public on an organization. Security definer by design (#887), same reasoning and same column list as public_event_sponsors; isolation is a tenant predicate on each arm separately (e.tenant_id and p.tenant_id = public_tenant_id()), which tenant_isolation_gaps() cannot check per arm. Derived from records staff already keep rather than curated, so nothing here is a second copy of a sponsor''s name, logo or website.';

-- The view's own predicates run before any caller-supplied filter, as on every
-- other anon-facing view (20260911010000 section 3).
alter view public.public_sponsor_wall set (security_barrier = true);

grant select on public.public_sponsor_wall to anon, authenticated;

-- 3. Writing the opt-in -------------------------------------------------------
--
-- set_person_role_tags (current copy 20260906090000) is the portal's only tag
-- writer. It gains a third argument naming which of the roles it is asserting
-- are public. `create or replace` cannot add a parameter -- it would leave two
-- overloads and make PostgREST's resolution ambiguous -- so the two-argument
-- function is dropped and the grant re-issued with the new one. The default
-- keeps existing two-argument callers working unchanged.
--
-- The upsert also stops ignoring the payload: with `on conflict do nothing` an
-- existing tag could never be published or unpublished, because the portal
-- re-sends every role on every save and the row it needs to change is exactly
-- the row that conflicts.
drop function public.set_person_role_tags(uuid, text[]);

create function public.set_person_role_tags(
  p_person_id uuid,
  p_roles text[],
  p_public_roles text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.has_permission('people', 'manage')
          or public.has_permission('people_intake', 'manage')) then
    raise exception 'Not authorized';
  end if;

  if not exists (
    select 1 from public.people
     where id = p_person_id and tenant_id = (select public.current_tenant_id())
  ) then
    raise exception 'No such person';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_roles, '{}'::text[])) as role
     where role not in ('donor', 'sponsor', 'volunteer', 'attendee', 'staff', 'partner')
  ) then
    raise exception 'Unknown role';
  end if;

  -- A public role the caller is not also asserting has nowhere to live: the
  -- delete below would remove the row the flag belongs to. Refusing makes the
  -- contradiction impossible to express rather than silently dropping half of
  -- it.
  if exists (
    select 1 from unnest(coalesce(p_public_roles, '{}'::text[])) as role
     where role <> all (coalesce(p_roles, '{}'::text[]))
  ) then
    raise exception 'Public role not asserted';
  end if;

  delete from public.person_role_tags
   where person_id = p_person_id
     and role <> all (coalesce(p_roles, '{}'::text[]));

  insert into public.person_role_tags (person_id, role, is_public)
  select
    p_person_id,
    role,
    role = any (coalesce(p_public_roles, '{}'::text[]))
  from unnest(coalesce(p_roles, '{}'::text[])) as role
  on conflict (person_id, role) do update
    set is_public = excluded.is_public;
end;
$$;

grant execute on function public.set_person_role_tags(uuid, text[], text[]) to authenticated;
