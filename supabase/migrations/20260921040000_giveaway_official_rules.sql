-- Official rules for a giveaway: a per-promotion document that freezes when it
-- is published (#1322).
--
-- #666 is the legal half -- whether an organization may run a promotion at
-- all, in which state, and whether a free entry method is required of it. That
-- is one organization's decision with its own counsel. This is the platform
-- half: the mechanism that carries whatever counsel decides.
--
-- The document is assembled from three layers (src/lib/giveaway-rules.ts):
-- the platform's neutral template, the organization's answers given once
-- (`giveaway_rules.*` in app_settings), and the promotion's own numbers, which
-- are derived from rows this schema already holds rather than retyped --
-- events.starts_at/ends_at, giveaways.drawing_date, giveaway_prizes and their
-- estimated_value, and the ticket pool #5 built.
--
-- Two tables, and the split is the whole design:
--
--   giveaway_rules            the live, editable state of one promotion's
--                             rules: which basis its odds are disclosed on,
--                             and any section somebody has rewritten for this
--                             promotion. Mutable, one row per giveaway.
--   giveaway_rules_versions   what was actually published, text and numbers
--                             together, with the instant it took effect.
--                             Append-only: no update policy, no delete policy,
--                             no update or delete grant.
--
-- **Why the instance is its own table rather than a site_content slot.**
-- site_content is (tenant_id, key) -> jsonb with one draft and one published
-- value per key, which is the right shape for a page that has one current
-- text. Official rules are a contract with the people who entered: repricing a
-- package, adding a prize or recording another donation after publication must
-- not silently restate the odds somebody relied on, and an entrant who wants
-- to know what they agreed to has to be able to read the version that was in
-- force when they entered. That needs an append-only history keyed to a
-- giveaway, which site_content has nowhere to put, and it is why the odds can
-- be derived at all -- a number that freezes is safe to compute.
--
-- Nothing is served until a version exists: a giveaway whose rules nobody has
-- published has no public page, exactly as a legal document nobody has adopted
-- 404s (#859). This migration publishes nothing and creates no rows.

create table public.giveaway_rules (
  id uuid primary key default gen_random_uuid(),
  -- No `on delete cascade` on the tenant reference, matching every other
  -- tenant table: delete_tenant() (20260906120000) deletes by tenant_id
  -- itself. The giveaway reference does cascade, like every other giveaway
  -- child table -- rules for a giveaway that no longer exists are nothing.
  tenant_id uuid not null default public.default_tenant_id()
    references public.tenants(id),
  giveaway_id uuid not null,
  -- Which pool the odds are stated against: 'bucket', 'colour' or 'overall'.
  -- #666 asks which of the three a promotion must publish and that is a
  -- question for an organization's counsel, so the template renders whichever
  -- this one picks (ODDS_BASES in src/lib/giveaway-rules.ts) rather than the
  -- schema deciding. Checked here as a backstop rather than as the validation:
  -- a new basis should be a registry entry, so the check names the three that
  -- exist rather than becoming an enum type.
  odds_basis text not null default 'bucket'
    check (odds_basis in ('bucket', 'colour', 'overall')),
  -- Sections rewritten for this one promotion, `{ "<section id>": ["...paragraph"] }`.
  -- Sparse on purpose, and in both directions: an absent section id is the
  -- template's own text for this giveaway, so improving the template reaches
  -- every promotion that has not been published yet, while a published version
  -- is a copy and is never reached again. An override on a tenant-answered
  -- section overrides that answer for this promotion only, which is what lets
  -- one giveaway differ without moving the organization's default.
  overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(overrides) = 'object' and length(overrides::text) <= 60000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid references auth.users(id),
  -- One set of rules per giveaway, and the target the version table's
  -- composite key references.
  constraint giveaway_rules_one_per_giveaway unique (tenant_id, giveaway_id),
  constraint giveaway_rules_tenant_id unique (tenant_id, id),
  constraint giveaway_rules_giveaway_fk
    foreign key (tenant_id, giveaway_id)
    references public.giveaways (tenant_id, id) on delete cascade
);

comment on table public.giveaway_rules is
  'The editable state of one giveaway''s official rules (#1322): the odds basis it discloses on, and any section rewritten for this promotion. What the public site serves is a row in giveaway_rules_versions, never this.';

comment on column public.giveaway_rules.overrides is
  'Section id -> paragraphs, sparse. An absent id means the template''s own text, assembled from src/lib/giveaway-rules-template.ts at publish time.';

create table public.giveaway_rules_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.default_tenant_id()
    references public.tenants(id),
  giveaway_rules_id uuid not null,
  -- 1, 2, 3... per set of rules. Assigned by publish_giveaway_rules() under
  -- the unique below, so two people publishing at once get two versions rather
  -- than one overwriting the other.
  version integer not null check (version > 0),
  -- The whole document as it was served: title, summary, and every section's
  -- text with the numbers already in it. A copy, not a reference (#895, and
  -- sharper here) -- a later edit to the template, to the organization's
  -- answers, or to the prize list cannot restate what an entrant relied on.
  content jsonb not null
    check (jsonb_typeof(content) = 'object' and length(content::text) <= 200000),
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  constraint giveaway_rules_versions_number unique (tenant_id, giveaway_rules_id, version),
  constraint giveaway_rules_versions_tenant_id unique (tenant_id, id),
  constraint giveaway_rules_versions_rules_fk
    foreign key (tenant_id, giveaway_rules_id)
    references public.giveaway_rules (tenant_id, id) on delete cascade
);

comment on table public.giveaway_rules_versions is
  'Append-only publication history of a giveaway''s official rules (#1322). One row per publish, holding the text and the numbers as served. Never updated and never deleted: the version in force when somebody entered is what governs their entry, and it stays readable.';

create index giveaway_rules_versions_rules_idx
  on public.giveaway_rules_versions (giveaway_rules_id, version desc);

create trigger set_updated_at before update on public.giveaway_rules
  for each row execute function public.set_updated_at();

-- What an organization publishes as the terms of a promotion is exactly the
-- kind of change that needs a trail, and none of it is anybody's personal
-- data, so nothing is redacted: the log holds the wording before and after.
insert into public.audited_tables (table_name, pk_column) values
  ('giveaway_rules', 'id'),
  ('giveaway_rules_versions', 'id');

create trigger audit_log_row after insert or update or delete on public.giveaway_rules
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.giveaway_rules_versions
  for each row execute function public.audit_log_row();

alter table public.giveaway_rules enable row level security;
alter table public.giveaway_rules_versions enable row level security;

-- events:view / events:manage, the mapping every other giveaway table uses
-- (20260822100000, 20260904100000). Writing a promotion's rules is part of
-- running the promotion, and the people who record its prizes and its tickets
-- are the people who describe them.
create policy "giveaway_rules select" on public.giveaway_rules for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

create policy "giveaway_rules insert" on public.giveaway_rules for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'manage')
  );

create policy "giveaway_rules update" on public.giveaway_rules for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'manage')
  );

create policy "giveaway_rules delete" on public.giveaway_rules for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'manage')
  );

grant select, insert, update, delete on public.giveaway_rules to authenticated;

-- Select only, for the portal's version list. Published rules are written by
-- publish_giveaway_rules() and by nothing else: an insert grant would let a
-- session write a version row with any content and any effective date, which
-- is precisely the history this table exists to make trustworthy. There is no
-- update or delete policy at all, so withdrawing a published version is not a
-- thing the product does -- a correction is a new version with its own
-- effective date, which is what the rules themselves say happens.
create policy "giveaway_rules_versions select" on public.giveaway_rules_versions for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('events', 'view')
  );

grant select on public.giveaway_rules_versions to authenticated;

-- What the public site reads, as `anon`.
--
-- Definer view over the published versions only, tenant-scoped by
-- public_tenant_id() -- the same shape as public_legal_publication and for the
-- same reason: `anon` has no policy on these tables, and the scoping is this
-- predicate rather than RLS. tenant_isolation_gaps() checks for exactly that
-- predicate, and refuses a write grant on a definer view, so this is select
-- only to both roles.
--
-- Every version is exposed, not only the newest: the version in force when
-- somebody entered is the one that governs their entry, so it has to stay
-- readable at a stable address for the life of the promotion.
create or replace view public.public_giveaway_rules as
select
  r.giveaway_id,
  -- The event the promotion runs at, so the public event page can find out
  -- whether there are rules to link to without being able to see a giveaway.
  -- Nothing else about the giveaway is exposed: the public site learns that a
  -- promotion published rules, and reads the rules, and that is all.
  g.event_id,
  v.version,
  v.content,
  v.effective_at
from public.giveaway_rules r
join public.giveaways g
  on g.id = r.giveaway_id
 and g.tenant_id = r.tenant_id
join public.giveaway_rules_versions v
  on v.giveaway_rules_id = r.id
 and v.tenant_id = r.tenant_id
where r.tenant_id = public.public_tenant_id();

comment on view public.public_giveaway_rules is
  'Published official rules for a tenant''s giveaways (#1322), every version, for the public rules page. A giveaway with no row here has no public rules page and its route 404s. Security definer by design (#887), same reasoning as public_legal_publication; isolation is the public_tenant_id() predicate.';

alter view public.public_giveaway_rules set (security_barrier = true);

grant select on public.public_giveaway_rules to anon, authenticated;

-- Publishing: freeze the document as it stands, and give it the next version
-- number.
--
-- The content is assembled in the application (src/lib/giveaway-rules-template.ts)
-- rather than here, because that is where the template's prose lives and where
-- it can be tested. What this function owns is what the application cannot do
-- safely from outside: the permission check, the tenant scoping, and the
-- version number, which is taken under the unique constraint so two people
-- publishing at the same moment produce two versions rather than one silently
-- winning.
--
-- The caller supplies the text, so a session holding events:manage can publish
-- any wording it likes. That is the same power it already has through
-- `overrides`, which is a free-text field on a row it may update; the gate on
-- both is events:manage, and every publish is in the audit log with its author.
create or replace function public.publish_giveaway_rules(
  p_giveaway_id uuid,
  p_content jsonb
)
returns table (version integer, effective_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (select public.current_tenant_id());
  v_rules_id uuid;
  v_version integer;
  v_effective timestamptz := now();
begin
  if not public.has_permission('events', 'manage') then
    raise exception 'Not authorized to publish official rules';
  end if;

  if jsonb_typeof(p_content) is distinct from 'object'
     or coalesce(jsonb_array_length(p_content -> 'sections'), 0) = 0 then
    raise exception 'EMPTY_RULES';
  end if;

  -- The rules row may not exist yet: publishing a promotion whose sections all
  -- come from the template and the numbers is a legitimate first act.
  insert into public.giveaway_rules (tenant_id, giveaway_id)
  select v_tenant_id, p_giveaway_id
  where exists (
    select 1 from public.giveaways g
    where g.id = p_giveaway_id and g.tenant_id = v_tenant_id
  )
  on conflict (tenant_id, giveaway_id) do nothing;

  select id into v_rules_id
  from public.giveaway_rules
  where giveaway_id = p_giveaway_id and tenant_id = v_tenant_id;

  if v_rules_id is null then
    raise exception 'GIVEAWAY_NOT_FOUND';
  end if;

  select coalesce(max(v.version), 0) + 1 into v_version
  from public.giveaway_rules_versions v
  where v.giveaway_rules_id = v_rules_id and v.tenant_id = v_tenant_id;

  -- The effective date the document prints and the one the row carries are
  -- the same instant, taken here. The application cannot supply it: its clock
  -- is a different clock, and a set of rules whose printed date disagrees with
  -- its own row is the kind of discrepancy this table exists to rule out.
  insert into public.giveaway_rules_versions
    (tenant_id, giveaway_rules_id, version, content, effective_at)
  values (
    v_tenant_id,
    v_rules_id,
    v_version,
    jsonb_set(p_content, '{effective_at}', to_jsonb(v_effective)),
    v_effective
  );

  return query select v_version, v_effective;
end;
$$;

comment on function public.publish_giveaway_rules(uuid, jsonb) is
  'Freezes a giveaway''s official rules as the next version (#1322). The only writer of giveaway_rules_versions: the table has no insert grant, so published rules always carry a version number assigned here.';

revoke all on function public.publish_giveaway_rules(uuid, jsonb) from public;
grant execute on function public.publish_giveaway_rules(uuid, jsonb) to authenticated;
