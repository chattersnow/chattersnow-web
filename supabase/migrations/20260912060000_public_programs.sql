-- #898: the Programs page can be driven by the Programs module instead of copy.
--
-- The public `/programs` page has always been four `site_content` slots, while
-- the portal has held the same program names a second time in `programs` since
-- #45. An operator maintained the list twice and the two drifted. This is the
-- half of that which lives in the database: what a program has to carry to be
-- publishable, and how `anon` reads it.
--
-- Which source a tenant's page actually uses is a `layout.programs_source` row
-- in `app_settings`, and needs no migration -- `public_site_layout` already
-- exposes the whole `layout.*` prefix (see `src/lib/site-layout.ts`).

-- 1. What a program needs to be publishable -----------------------------------
--
-- `description` doubles as the public blurb rather than gaining a
-- `public_summary` beside it: two description fields on one form is a question
-- every operator has to answer twice, and the portal labels the field as
-- public-facing instead.
alter table public.programs
  add column is_public boolean not null default false,
  add column pillar text,
  add column emoji text,
  add column sort_order integer;

comment on column public.programs.is_public is
  'Whether this program appears on the public Programs page, when that page is set to read the Programs module (#898). Default false: switching the page''s source must never publish a program nobody reviewed (#360).';
comment on column public.programs.pillar is
  'The label of the pillar this program is listed under, matched against the tenant''s programs.pillars copy. Null or unmatched is not an error -- the page renders those programs in a trailing ungrouped section rather than dropping them.';
comment on column public.programs.emoji is
  'An optional glyph shown before the name on the public card, as the programs.items copy already allows.';
comment on column public.programs.sort_order is
  'Public ordering within a pillar, nulls last, then by name.';

-- 2. What `anon` reads --------------------------------------------------------
--
-- Family A of #887: `programs` says `for select to authenticated`, the public
-- website reads as `anon`, so the tenant predicate lives in the view rather
-- than in a policy. Explicit column list -- `created_by`, `status` and the
-- audit columns are nobody's business on the public internet.
--
-- `is_public` is the only publication gate. A `retired` program left public
-- still shows, which is explicit-beats-implicit and matches
-- `volunteer_role_types`: `status` is an internal lifecycle field, and a page
-- that silently dropped a card the operator had marked public would be a bug
-- report rather than a feature. The portal surfaces the combination as a
-- warning instead of enforcing it here.
create or replace view public.public_programs as
select id, name, description, pillar, emoji, sort_order
from public.programs
where is_public = true
  and tenant_id = public.public_tenant_id();

comment on view public.public_programs is
  'Programs a tenant has marked for its public site (#898). Security definer by design (#887): programs admits `authenticated` only, so isolation is the tenant_id = public_tenant_id() predicate rather than RLS. is_public is the only publication gate; status is an internal lifecycle field.';

-- The view's own predicates run before any caller-supplied filter, as on every
-- other anon-facing view (20260911010000 section 3).
alter view public.public_programs set (security_barrier = true);

grant select on public.public_programs to anon, authenticated;

-- 3. Publishing a program is a governance act ---------------------------------
--
-- `site_content` and `app_settings` are audited because what the public site
-- says is a decision someone made. Marking a program public puts it on the
-- same website through a different door, so the table joins them.
insert into public.audited_tables (table_name) values ('programs');

create trigger audit_log_row after insert or update or delete on public.programs
  for each row execute function public.audit_log_row();

-- 4. A pillar picker for roles that cannot read site_content -------------------
--
-- `site_content`'s select policy requires `site_content:view`, which only
-- `admin` holds (20260906130000:122), while `event_coordinator` manages
-- programs. Without this the pillar would have to be free text on the form,
-- and a typo silently ungroups a program on the live site.
--
-- Published copy only, deliberately: the picker should offer the pillars the
-- public page is grouping by right now, not ones still in draft.
create or replace function public.list_program_pillars()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.has_permission('programs', 'manage') then coalesce(
      (select array_agg(item->>'label' order by ordinality)
         from public.site_content sc,
              jsonb_array_elements(sc.value) with ordinality as t(item, ordinality)
        where sc.key = 'programs.pillars'
          and sc.tenant_id = public.current_tenant_id()
          and jsonb_typeof(sc.value) = 'array'),
      '{}')
    else '{}'
  end;
$$;

comment on function public.list_program_pillars() is
  'The current tenant''s published pillar labels, for the pillar picker on the Programs form (#898). Security definer because site_content:view is an admin-only permission and programs:manage is not; the permission check is in the body.';

revoke execute on function public.list_program_pillars() from public, anon;
grant execute on function public.list_program_pillars() to authenticated;
