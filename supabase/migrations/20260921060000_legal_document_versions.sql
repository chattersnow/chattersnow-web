-- A citable version identity for the legal documents, and the immutable
-- snapshot behind it (#601).
--
-- `site_content` holds one current value per slot. That answers "what does our
-- privacy policy say" and, through `audit_log`, "what did it say in March, and
-- who changed it" -- for anyone willing to read a diff of two JSON blobs. What
-- it cannot answer is the question a person actually asks: *which version was
-- in force when I registered*, at an address they can be sent to and read.
--
-- So: one append-only row per publish, per document, per tenant, carrying the
-- whole published value and the instant it took effect. Same split #1322 made
-- one day earlier for a promotion's official rules, and for the same reason --
-- the editable state lives in its own table (there, `giveaway_rules`; here,
-- `site_content`), and what was *served* is a copy that nothing edits again.
--
-- Three things follow from "append-only" and are enforced rather than
-- intended: no insert grant (publish_site_content is the only writer), no
-- update policy, no delete policy. A correction is a new version with its own
-- effective date, which is what the documents themselves say happens.
--
-- Scope note. #600 carried this table for a while and handed it back when its
-- approval gate turned out to need only the `site_content` row; `review_notes`
-- went back with it and is deliberately not here. The approval that let a
-- version publish is on the row it approved and in `audit_log` beside it.

-- 1. The table ---------------------------------------------------------------

create table public.legal_document_versions (
  id uuid primary key default gen_random_uuid(),
  -- No `on delete cascade` on the tenant reference, matching every other
  -- tenant table: delete_tenant() (20260906120000) deletes by tenant_id
  -- itself, and both it and export_tenant_data() walk the catalog for the
  -- column rather than a hand-written list, so this table joins the export and
  -- the deletion by having it.
  tenant_id uuid not null default public.default_tenant_id()
    references public.tenants(id),
  -- The document key from the registry in src/lib/legal-documents.ts --
  -- 'privacy', 'terms', 'code_of_conduct' -- which is the `legal.` slot's
  -- suffix. Shape-checked rather than enumerated: the registry is the source
  -- of truth, and a fourth document should be an entry there rather than a
  -- migration to widen a constraint.
  document text not null check (document ~ '^[a-z0-9_]+$'),
  -- 1, 2, 3... per (tenant, document). Assigned inside publish_site_content()
  -- under the unique below, so two people publishing at once get two versions
  -- rather than one overwriting the other.
  version integer not null check (version > 0),
  -- The published `site_content.value` exactly as it was served: title,
  -- last_updated, summary and every section. A copy, not a reference -- that
  -- is the whole point, and the reason the live row stays free to change.
  --
  -- Deliberately not checked for the shape of a document. `site_content.value`
  -- is unconstrained jsonb, and a `legal.*` slot holding something that is not
  -- a document is a thing the product already permits; a check here would turn
  -- this table into a gate on publishing, which is exactly what it must not
  -- be -- the history records what was published, it does not decide what may
  -- be. The shape is checked where it is rendered instead
  -- (`isLegalDocumentContent` in src/lib/legal-versions.ts), which drops a row
  -- that is not a document rather than failing the page. The size cap stays:
  -- it bounds an append-only table.
  content jsonb not null check (length(content::text) <= 200000),
  -- What the site collected at the moment this text went live (#1292), copied
  -- off the same publish that writes the fingerprint into
  -- `legal_surface.<document>`. That setting holds the *current* document's
  -- surface and is overwritten by the next publish; this column is the per
  -- version record #1292's ordering note said would land here. Null on a
  -- version published before the fingerprint existed, and on the backfill
  -- below, which is unknown rather than "collected nothing".
  surfaces jsonb check (surfaces is null or jsonb_typeof(surfaces) = 'array'),
  effective_at timestamptz not null default now(),
  -- The organization's reporting zone at publish time, frozen with the text --
  -- the same move #1322 makes with `time_zone` inside a set of official rules,
  -- and for a sharper reason here. `effective_at` is an instant, and the page
  -- that renders it is read by `anon`, which has no access to `org_timezone`
  -- (that view is `current_tenant_id()` and authenticated-only). Without this
  -- the public site would print an effective date in UTC and be a day out for
  -- half the publishes made in the Americas.
  time_zone text not null default 'UTC',
  created_at timestamptz not null default now(),
  -- Nullable, unlike giveaway_rules_versions.created_by: the backfill below
  -- takes whatever `published_by` the live row carries, and a row published by
  -- a service-role script has none. A version with no named author is still a
  -- true record of what was served.
  created_by uuid references auth.users(id),
  constraint legal_document_versions_number unique (tenant_id, document, version),
  constraint legal_document_versions_tenant_id unique (tenant_id, id)
);

comment on table public.legal_document_versions is
  'Append-only publication history of a tenant''s legal documents (#601). One row per publish of a legal.* site content slot, holding the value as served and the instant it took effect. Never updated and never deleted: the version in force when somebody read it is what they read, and it stays readable at /privacy?version=N and the equivalents.';

comment on column public.legal_document_versions.document is
  'The key from the registry in src/lib/legal-documents.ts: the suffix after `legal.` in site content.';
comment on column public.legal_document_versions.content is
  'The published site_content.value, copied. Nothing edits it again.';
comment on column public.legal_document_versions.surfaces is
  'The collection surface this text was published against (#1292), or null where it was never recorded.';
comment on column public.legal_document_versions.time_zone is
  'The tenant''s reporting zone at publish time, so the public site can print `effective_at` as the organization''s own date without reading a setting `anon` cannot see.';

create index legal_document_versions_document_idx
  on public.legal_document_versions (tenant_id, document, version desc);

-- What an organization publishes as its privacy policy is exactly the kind of
-- change that needs a trail, and none of it is anybody's personal data, so
-- nothing is redacted.
insert into public.audited_tables (table_name, pk_column) values
  ('legal_document_versions', 'id');

create trigger audit_log_row after insert or update or delete on public.legal_document_versions
  for each row execute function public.audit_log_row();

alter table public.legal_document_versions enable row level security;

-- Select only, for the portal's version list, on `site_content:view` -- the
-- permission that already governs reading what the public site says.
--
-- There is no insert policy and no insert grant: a session able to write here
-- could record any text under any effective date, which is precisely the
-- history this table exists to make trustworthy. There is no update or delete
-- policy either, so withdrawing a published version is not a thing the product
-- does.
create policy "legal_document_versions select" on public.legal_document_versions for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'view')
  );

grant select on public.legal_document_versions to authenticated;

-- RLS does not stop a TRUNCATE, and Supabase's schema-wide default privileges
-- hand `anon` and `authenticated` TRUNCATE on every table in `public` --
-- `site_content`, `events` and `giveaway_rules_versions` included. That is a
-- platform-wide condition and not this migration's to fix, but a table whose
-- entire contract is "never updated, never deleted" should not be one
-- statement from empty, so it is revoked here and the self-check at the foot
-- of this file holds it revoked.
revoke truncate on public.legal_document_versions from anon, authenticated;

-- 2. What the public site reads, as `anon` -----------------------------------
--
-- Definer view, tenant-scoped by public_tenant_id() -- the same shape as
-- public_site_content and public_giveaway_rules, and for the same reason:
-- `anon` has no policy on the base table, and the scoping is this predicate
-- rather than RLS. tenant_isolation_gaps() (#887) checks for exactly that
-- predicate and refuses a write grant on a definer view, so this is select
-- only to both roles.
--
-- Every version is exposed, not only the newest: a superseded version has to
-- stay readable, which is the whole of this ticket. Whether the *route* serves
-- it is a separate question, and #859's adoption gate answers it -- the
-- permalinks sit under the same layout as the live document, so a document
-- this tenant never put in force 404s at every version exactly as it does
-- live.
create or replace view public.public_legal_document_versions as
select v.document, v.version, v.content, v.effective_at, v.time_zone
from public.legal_document_versions v
where v.tenant_id = public.public_tenant_id();

comment on view public.public_legal_document_versions is
  'The resolved tenant''s published legal document versions (#601), every one of them, for the permalinks on /privacy, /terms and /code-of-conduct. Security definer by design (#887), same reasoning as public_site_content; isolation is the public_tenant_id() predicate. `surfaces` is deliberately absent -- what a tenant''s site collects is not the public''s business.';

alter view public.public_legal_document_versions set (security_barrier = true);

grant select on public.public_legal_document_versions to anon, authenticated;

-- 3. The history that already happened ---------------------------------------
--
-- Every legal document a tenant is serving today became version 1 at the
-- moment it was published, and `site_content` knows when that was and who did
-- it. Backfilling it is the difference between a feature that answers "which
-- version is this" from today and one that answers it from the first day
-- anybody republishes -- and inventing nothing: the date and the author are
-- the row's own.
--
-- Only published text. A draft is not a version, and a slot serving the
-- platform's default has no version of its own by construction (#858) -- what
-- the reader is told in that case is keyed to PLATFORM_LEGAL_LAST_UPDATED in
-- src/lib/legal-defaults.ts, not to a row here.
insert into public.legal_document_versions
  (tenant_id, document, version, content, effective_at, time_zone, created_by)
select sc.tenant_id,
       substring(sc.key from 7),
       1,
       sc.value,
       coalesce(sc.published_at, sc.updated_at),
       -- The tenant's zone as it stands, which is the best available answer
       -- for a publish that predates the column. It is used to print a date,
       -- not to reconstruct one.
       coalesce(
         (select s.value #>> '{}'
            from public.app_settings s
           where s.tenant_id = sc.tenant_id and s.key = 'org.timezone'),
         'UTC'),
       sc.published_by
from public.site_content sc
where sc.key like 'legal.%'
  and sc.value is not null;

-- 4. Publishing writes the version -------------------------------------------
--
-- Inside the RPC rather than in the Server Action that calls it, for the
-- reason 20260908000000 revoked the write grants in the first place:
-- `publish_site_content` is the only way a `legal.*` slot can reach the public
-- site, so a version written anywhere else is a version somebody could forget
-- to write. Publishing *is* the new version -- there is nothing to remember.
--
-- Same signature as 20260921020000, so this is a straight replacement with no
-- overload to disambiguate and no grants to restate.
create or replace function public.publish_site_content(
  p_keys text[],
  p_legal_surface jsonb default null,
  p_approval jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_count integer;
  -- `legal_surface.*` keys, already built from the slots that published: the
  -- ones now serving the tenant's own text, and the ones handed back to the
  -- platform's.
  v_own text[];
  v_reverted text[];
  -- document key -> published value, for the version rows below. Only the
  -- slots that actually published, and only the ones that published text: a
  -- revert to the platform's default is the absence of a version, not a
  -- version of nothing.
  v_versioned jsonb;
  -- One instant for the whole publish, so a page's documents share an
  -- effective date and none of them disagrees with its own fingerprint.
  v_now timestamptz := now();
  -- Frozen onto each version row: see the column comment.
  v_zone text;
  v_gated boolean;
  v_reference text;
  v_notes text;
begin
  if v_tenant is null then
    raise exception 'NO_TENANT';
  end if;
  if not public.has_permission('site_content', 'manage') then
    raise exception 'FORBIDDEN';
  end if;
  if p_keys is null or array_length(p_keys, 1) is null then
    return 0;
  end if;

  -- Whether this publish has to carry an approval: the tenant's setting, and a
  -- `legal.*` slot among the ones that will actually publish. A key named with
  -- no pending draft publishes nothing, and demanding an approval for nothing
  -- would refuse a publish of the twelve other pages because a legal slot was
  -- in the list and unchanged.
  v_gated := coalesce(
    (select s.value = to_jsonb(true)
       from public.app_settings s
      where s.tenant_id = v_tenant
        and s.key = 'legal_approval.required'),
    false)
    and exists (
      select 1 from public.site_content sc
      where sc.tenant_id = v_tenant
        and sc.key = any(p_keys)
        and sc.key like 'legal.%'
        and sc.has_draft
    );

  if v_gated then
    v_reference := nullif(btrim(coalesce(p_approval ->> 'reference', '')), '');
    v_notes := nullif(btrim(coalesce(p_approval ->> 'notes', '')), '');
    if v_reference is null or v_notes is null then
      raise exception 'APPROVAL_REQUIRED';
    end if;

    -- The four eyes. A draft with no recorded author is refused rather than
    -- waved through: `draft_updated_by` is null only where there was no
    -- session behind the write -- a service-role script -- and "we cannot tell
    -- who wrote this" is not a second pair of eyes.
    if exists (
      select 1 from public.site_content sc
      where sc.tenant_id = v_tenant
        and sc.key = any(p_keys)
        and sc.key like 'legal.%'
        and sc.has_draft
        and sc.draft_updated_by is null
    ) then
      raise exception 'APPROVAL_DRAFTER_UNKNOWN';
    end if;
    if exists (
      select 1 from public.site_content sc
      where sc.tenant_id = v_tenant
        and sc.key = any(p_keys)
        and sc.key like 'legal.%'
        and sc.has_draft
        and sc.draft_updated_by = auth.uid()
    ) then
      raise exception 'APPROVAL_SELF';
    end if;
  end if;

  -- A draft of NULL publishes as NULL, which is the slot going back to the
  -- registry default. The row stays, so the revert keeps an author and a date
  -- rather than vanishing; `public_site_content` filters it out.
  --
  -- The approval columns are written on every publish rather than only on a
  -- gated one, because the other direction is clearing them: an approval left
  -- behind from last month would sit beside text nobody approved, and
  -- `audit_log` would snapshot it as though they belonged together.
  --
  -- The published keys are captured rather than re-read: the fingerprint and
  -- the version rows must describe documents that actually changed. A caller
  -- may name a slot with no pending draft -- nothing publishes, and stamping
  -- that slot with today's surface would mark a stale document fresh, which is
  -- that feature's own failure mode written by its own hand. A version row for
  -- it would be worse still: a second version identical to the first, with a
  -- date claiming the organization republished on a day it did nothing.
  with published as (
    update public.site_content
    set value = draft_value,
        draft_value = null,
        has_draft = false,
        approved_by = case when v_gated and key like 'legal.%'
                           then auth.uid() end,
        approved_at = case when v_gated and key like 'legal.%'
                           then v_now end,
        approval_reference = case when v_gated and key like 'legal.%'
                                  then v_reference end,
        review_notes = case when v_gated and key like 'legal.%'
                            then v_notes end
    where tenant_id = v_tenant
      and key = any(p_keys)
      and has_draft
    returning key, value
  )
  select count(*)::integer,
         coalesce(
           array_agg('legal_surface.' || substring(key from 7))
             filter (where key like 'legal.%' and value is not null),
           '{}'),
         coalesce(
           array_agg('legal_surface.' || substring(key from 7))
             filter (where key like 'legal.%' and value is null),
           '{}'),
         jsonb_object_agg(substring(key from 7), value)
           filter (where key like 'legal.%' and value is not null)
    into v_count, v_own, v_reverted, v_versioned
  from published;

  -- The version rows, in the same transaction as the publish they record.
  -- Either the public site has the new text and the history has the row, or
  -- neither happened; a snapshot that can be missing is not a record.
  --
  -- The number is taken here under `legal_document_versions_number`, so two
  -- administrators publishing the same document at the same moment produce two
  -- versions rather than one silently winning. The loser of the race fails on
  -- the unique and takes its whole publish down with it, which is the right
  -- way round: the alternative is a publish that succeeded with no version
  -- behind it.
  if v_versioned is not null then
    select coalesce(s.value #>> '{}', 'UTC') into v_zone
    from public.app_settings s
    where s.tenant_id = v_tenant and s.key = 'org.timezone';

    insert into public.legal_document_versions
      (tenant_id, document, version, content, surfaces, effective_at, time_zone, created_by)
    select v_tenant,
           doc.key,
           coalesce(
             (select max(existing.version)
                from public.legal_document_versions existing
               where existing.tenant_id = v_tenant
                 and existing.document = doc.key),
             0) + 1,
           doc.value,
           p_legal_surface -> 'surfaces',
           v_now,
           coalesce(v_zone, 'UTC'),
           auth.uid()
    from jsonb_each(v_versioned) as doc(key, value);
  end if;

  if p_legal_surface is not null then
    -- Only a tenant's own text has a fingerprint. Publishing a NULL over a
    -- `legal.*` slot hands the route back to the platform's document, which is
    -- regenerated from the live configuration on every request and so cannot
    -- go stale -- and a fingerprint left behind would describe a document
    -- nobody is serving.
    delete from public.app_settings
    where tenant_id = v_tenant
      and key = any(v_reverted);

    insert into public.app_settings (tenant_id, key, value, updated_by)
    select v_tenant,
           fingerprint.setting_key,
           p_legal_surface || jsonb_build_object('published_at', v_now),
           auth.uid()
    from unnest(v_own) as fingerprint(setting_key)
    on conflict (tenant_id, key) do update
      set value = excluded.value,
          updated_by = excluded.updated_by;
  end if;

  return v_count;
end;
$$;

comment on function public.publish_site_content(text[], jsonb, jsonb) is
  'Moves the named slots'' drafts onto the public site for the caller''s tenant, in one statement so a page publishes atomically (#793). SECURITY DEFINER because `value` is not writable by `authenticated` at all: this is the only way to publish. `p_legal_surface` (#1292) is the collection surface the caller computed for this tenant, stored as legal_surface.<document> for each `legal.*` slot that actually published. `p_approval` (#600) is {"reference", "notes"}, required -- from somebody other than the drafter -- when the tenant has legal_approval.required on and a legal.* slot is among the ones publishing; it is recorded on the rows it approves, and cleared from every other publish so that no approval outlives the text it was given for. Every `legal.*` slot that publishes text also appends a legal_document_versions row (#601), in the same transaction: this function is that table''s only writer.';

-- 5. Self-check --------------------------------------------------------------
--
-- The append-only claim, asserted rather than commented. A write grant on the
-- table would let a session record any wording under any effective date, and
-- the version history would be worth nothing.
do $$
declare
  v_privileges text;
begin
  select string_agg(distinct privilege_type, ', ') into v_privileges
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name = 'legal_document_versions'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if v_privileges is not null then
    raise exception 'legal_document_versions is writable by a session role (%); the publication history can be rewritten', v_privileges;
  end if;
end $$;
