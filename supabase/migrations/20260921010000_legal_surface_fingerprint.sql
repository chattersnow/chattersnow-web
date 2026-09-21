-- Record what a legal document covered when it was published (#1292).
--
-- A tenant may replace any of the three legal documents with its own text, and
-- must be able to: the privacy policy is a statement by the organization, not
-- by the platform (#858). But a document written in March never mentions the
-- artwork open calls switched on in June, and nobody re-reads their own privacy
-- policy unprompted. The platform cannot fix that text -- it has no standing to
-- write an organization's legal position, and silently re-inserting a paragraph
-- into a document counsel signed off would be worse than the drift. What it can
-- do is notice.
--
-- So each published `legal.*` slot gets a fingerprint of what the site was
-- collecting at the moment it was published: the sorted keys of
-- `collectionSurface()` (`src/lib/legal-surface.ts`), the same definition that
-- writes the platform's own document. Comparing prose against generated facts
-- would be guesswork; comparing a recorded set of keys is exact and cheap.
--
-- One `app_settings` row per document, under a `legal_surface.` prefix beside
-- `page_visibility.` and `legal_publication.` -- same table, same RLS, nothing
-- new to secure. It is deliberately *not* one of the reserved public
-- namespaces in `src/lib/public-namespaces.ts`: no view serves it to `anon`,
-- because a visitor has no business knowing which switches an organization has
-- flipped since it last published.
--
-- Why the write lives in here rather than in the Server Action that computes
-- it: a fingerprint written after the RPC returns is a second transaction, and
-- the failure mode of that is the publish succeeding while the fingerprint
-- write fails -- leaving the document reading as *unknown* forever, with
-- nothing left to retry it. Silent stale state is the exact thing this feature
-- exists to prevent, so it must not be reachable through the feature's own
-- write path.

-- The old one-argument function has to go rather than being replaced in place:
-- `create or replace` with a new signature creates an overload, and a call
-- sending only `p_keys` would then match both and fail as ambiguous.
drop function if exists public.publish_site_content(text[]);

create function public.publish_site_content(
  p_keys text[],
  p_legal_surface jsonb default null
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

  -- A draft of NULL publishes as NULL, which is the slot going back to the
  -- registry default. The row stays, so the revert keeps an author and a date
  -- rather than vanishing; `public_site_content` filters it out.
  --
  -- The published keys are captured rather than re-read: the fingerprint must
  -- describe documents that actually changed. A caller may name a slot with no
  -- pending draft -- nothing publishes, and stamping that slot with today's
  -- surface would mark a stale document fresh, which is this feature's own
  -- failure mode written by its own hand.
  with published as (
    update public.site_content
    set value = draft_value,
        draft_value = null,
        has_draft = false
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
           '{}')
    into v_count, v_own, v_reverted
  from published;

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
           p_legal_surface || jsonb_build_object('published_at', now()),
           auth.uid()
    from unnest(v_own) as fingerprint(setting_key)
    on conflict (tenant_id, key) do update
      set value = excluded.value,
          updated_by = excluded.updated_by;
  end if;

  return v_count;
end;
$$;

comment on function public.publish_site_content(text[], jsonb) is
  'Moves the named slots'' drafts onto the public site for the caller''s tenant, in one statement so a page publishes atomically (#793). SECURITY DEFINER because `value` is not writable by `authenticated` at all: this is the only way to publish. `p_legal_surface` (#1292) is the collection surface the caller computed for this tenant; it is stored as legal_surface.<document> for each `legal.*` slot that actually published, in this transaction, and ignored entirely when null. The function stays ignorant of what a surface means -- it records what it was handed, stamped with the transaction''s own clock rather than the caller''s.';

revoke execute on function public.publish_site_content(text[], jsonb) from public;
grant execute on function public.publish_site_content(text[], jsonb) to authenticated;

-- No backfill, on purpose. A document published before today has no record of
-- what it covered, and inventing one from today's configuration would assert
-- something nobody checked. Absent reads as *unknown* in the portal -- a
-- quieter line asking for a re-publish -- rather than as "collected nothing",
-- which would show every tenant that has ever published a false drift warning
-- on day one.
