-- #1014: Meet the Team can be driven by People instead of retyped copy.
--
-- The public `/about/team` page has always been the `about_team.members`
-- list in `site_content`, while every one of those people is also a `people`
-- row and the board members among them carry a title in `board_members`. A
-- tenant maintained its leadership twice and the two drifted. This is the
-- half of that which lives in the database: what a person has to carry to be
-- shown on the team page, and how `anon` reads it.
--
-- Which source a tenant's page actually uses is a `layout.team_source` row in
-- `app_settings`, and needs no migration -- `public_site_layout` already
-- exposes the whole `layout.*` prefix (see `src/lib/site-layout.ts`), exactly
-- as `layout.programs_source` did for #898.

-- 1. The opt-in is a row, not a flag ------------------------------------------
--
-- The public fields live in their own table rather than as columns on
-- `people`. Everything else on `people` is internal and PII-adjacent; a public
-- biography beside a phone number invites the wrong copy into the wrong field.
-- It also spares `people_with_roles` (a `select p.*` that has to be dropped and
-- recreated for every new column, 20260905060000) and the merge_people field
-- allowlist. The row's presence *is* the opt-in: nobody is on the site without
-- one, and removing it removes them. merge_people() repoints the composite
-- foreign key like any other (20260906080000), so a merge keeps the listing.
--
-- `public_role` is what the site shows, deliberately separate from
-- `board_members.role_title`: staff and volunteer leads belong on the team
-- page without being board rows, and a board title is not always the public
-- one.
create table public.public_team_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  person_id uuid not null,
  public_role text,
  -- Same constraint as people.logo_url (#920): a typed link, not an upload.
  photo_url text check (photo_url ~* '^https?://'),
  bio text,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (tenant_id, person_id),
  unique (tenant_id, id),
  -- Composite, so a listing cannot be hung off another tenant's person; every
  -- foreign key between two tenant tables references (tenant_id, id)
  -- (20260906080000), and `tenant_isolation_gaps()` fails the build over a
  -- new one that does not.
  foreign key (tenant_id, person_id)
    references public.people (tenant_id, id) on delete cascade
);

comment on table public.public_team_members is
  'The people a tenant has put on its public Meet the Team page, with the fields that page shows (#1014). One row per person; the row is the opt-in. Only read by the public site when layout.team_source is ''people''.';
comment on column public.public_team_members.public_role is
  'The role line shown under the name on the public page. Free text, separate from board_members.role_title so staff and volunteer leads can be listed and a board title need not be the public one.';
comment on column public.public_team_members.photo_url is
  'A link to the portrait, constrained like people.logo_url (#920). Null falls back to the tenant''s about_team_photo image slot, as a copy row without a photo does.';
comment on column public.public_team_members.bio is
  'The public biography. Blank lines separate paragraphs, matching the paragraphs a copy row stores as an array. Public text: nothing else on the person''s record is.';
comment on column public.public_team_members.sort_order is
  'Public ordering, nulls last, then by name.';

create index public_team_members_tenant_id_idx on public.public_team_members (tenant_id);
create index public_team_members_person_id_idx on public.public_team_members (person_id);

create trigger set_updated_at before update on public.public_team_members
  for each row execute function public.set_updated_at();

alter table public.public_team_members enable row level security;

create policy "public_team_members select" on public.public_team_members for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('people', 'view')
  );
create policy "public_team_members insert" on public.public_team_members for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('people', 'manage')
  );
create policy "public_team_members update" on public.public_team_members for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('people', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('people', 'manage')
  );
create policy "public_team_members delete" on public.public_team_members for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('people', 'manage')
  );

grant select, insert, update, delete on public.public_team_members to authenticated;

-- 2. What `anon` reads --------------------------------------------------------
--
-- Family A of #887: `people` and `public_team_members` both say `for select
-- to authenticated`, the public website reads as `anon`, so the tenant
-- predicate lives in the view rather than in a policy. Explicit column list:
-- `person_id`, the audit columns and everything on `people` other than the
-- name are nobody's business on the public internet.
--
-- The name is the display rule the portal uses (preferred name, else name).
-- A person with neither -- an anonymous donor record, say -- has nothing to
-- show and is left out rather than rendered as a blank card.
create or replace view public.public_team as
select
  m.id,
  coalesce(p.preferred_name, p.name) as name,
  m.public_role as role,
  m.photo_url,
  m.bio,
  m.sort_order
from public.public_team_members m
join public.people p on p.tenant_id = m.tenant_id and p.id = m.person_id
where m.tenant_id = public.public_tenant_id()
  and coalesce(p.preferred_name, p.name) is not null;

comment on view public.public_team is
  'The people the resolved tenant has put on its public Meet the Team page (#1014). Security definer by design (#887): people and public_team_members admit `authenticated` only, so isolation is the tenant_id = public_tenant_id() predicate rather than RLS. The row in public_team_members is the only publication gate; the column list is the name and the four public fields and nothing else from people.';

-- The view's own predicates run before any caller-supplied filter, as on every
-- other anon-facing view (20260911010000 section 3).
alter view public.public_team set (security_barrier = true);

grant select on public.public_team to anon, authenticated;

-- 3. Putting a person on the website is a governance act -----------------------
--
-- `site_content` and `app_settings` are audited because what the public site
-- says is a decision someone made, and `programs` joined them for the same
-- reason (#898). Listing a person on the public site is that decision about a
-- person, so the table joins them too.
insert into public.audited_tables (table_name) values ('public_team_members');

create trigger audit_log_row after insert or update or delete on public.public_team_members
  for each row execute function public.audit_log_row();
