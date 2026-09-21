-- A second approver before a legal document publishes, per tenant (#600).
--
-- One person holding `site_content:manage` can replace this organization's
-- privacy policy and put it on the public site in one gesture. For a tenant
-- with a board and a handful of administrators, a second pair of eyes on that
-- is a reasonable control, and the authorship stamps #793 added already make
-- it checkable: `draft_updated_by` is who wrote the words and `published_by`
-- is who put them live, both set by trigger from `auth.uid()` rather than sent
-- by the browser, so neither can be forged by the person doing it.
--
-- **It cannot be a platform-wide rule.** The portal ships an attention item
-- called `access_management_single_administrator` precisely because
-- single-administrator tenants are an expected, supported state, and the
-- platform sells to small businesses as well as small nonprofits. A hard
-- four-eyes gate here would mean such a tenant can never publish its own
-- privacy policy at all -- pinned to the platform's default indefinitely, with
-- no way out short of buying another seat. That is a worse outcome than the
-- risk being controlled, and nothing legal requires four eyes on a privacy
-- policy. So: a per-tenant setting, `legal_approval.required` in
-- `app_settings`, defaulting **off**, in the same shape as
-- `legal_publication.*` and `page_visibility.*` beside it.
--
-- The gate is enforced here rather than in the Server Action that calls this,
-- for the reason 20260908000000 revoked the write grants in the first place:
-- `publish_site_content` is the only way a `legal.*` slot can reach the public
-- site, and a gate the browser can go around is not a gate.
--
-- Where the approval is recorded, given #600 deferred the version table to
-- #601: on the `site_content` row itself. `site_content` is in
-- `audited_tables`, so `audit_log` snapshots the row on every publish -- the
-- approval lands in the audit trail beside the exact text it approved, which
-- is the whole of what a version row would have been asked for here.

-- 1. The approval, on the row it approves ------------------------------------

alter table public.site_content
  add column approved_by uuid references auth.users(id),
  add column approved_at timestamptz,
  add column approval_reference text,
  add column review_notes text;

comment on column public.site_content.approved_by is
  'Who approved the currently published value, when the tenant requires a second approver on legal documents (#600). Null everywhere the gate was off, which is every slot that is not legal.* and every tenant that has not switched it on.';
comment on column public.site_content.approval_reference is
  'Free text naming what the approval was: a meeting, a review, an email thread. Deliberately not a foreign key -- `governance` is a non-core module a tenant may not be entitled to, and a tenant may have no board at all.';
comment on column public.site_content.review_notes is
  'What the approver said when they approved this text.';

-- 2. Who could be the second pair of eyes ------------------------------------
--
-- The count behind the refusal in `updateLegalApprovalAction`: a tenant with
-- one holder of `site_content:manage` must not be able to switch the gate on,
-- or it arrives at the lockout above by a different route -- a setting that
-- pins the only administrator out of their own legal text.
--
-- Narrowed to the caller's own tenant and gated on `system_settings:manage`,
-- the permission that writes the setting, so this cannot be used to size
-- somebody else's organization. Deactivated accounts do not count: they cannot
-- sign in, so they cannot approve anything.

create or replace function public.site_content_approver_count()
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(distinct ur.user_id)::integer
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.resources res on res.id = rp.resource_id
  where public.has_permission('system_settings', 'manage')
    and ur.tenant_id = (select public.current_tenant_id())
    and res.key = 'site_content'
    and public.permission_rank(rp.level) >= public.permission_rank('manage')
    and not exists (
      select 1 from public.deactivated_users du where du.user_id = ur.user_id
    );
$$;

comment on function public.site_content_approver_count() is
  'How many people in the caller''s tenant could publish website content, for the refusal that stops a single-administrator tenant switching the legal approval gate on (#600).';

revoke execute on function public.site_content_approver_count() from public;
grant execute on function public.site_content_approver_count() to authenticated;

-- 3. The gate, inside the only write path ------------------------------------
--
-- The old two-argument function has to go rather than being replaced in place:
-- `create or replace` with a new signature creates an overload, and a call
-- sending only `p_keys` and `p_legal_surface` would then match both and fail
-- as ambiguous. Same surgery 20260921010000 did to the one-argument version.
drop function if exists public.publish_site_content(text[], jsonb);

create function public.publish_site_content(
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
  -- The published keys are captured rather than re-read: the fingerprint must
  -- describe documents that actually changed. A caller may name a slot with no
  -- pending draft -- nothing publishes, and stamping that slot with today's
  -- surface would mark a stale document fresh, which is this feature's own
  -- failure mode written by its own hand.
  with published as (
    update public.site_content
    set value = draft_value,
        draft_value = null,
        has_draft = false,
        approved_by = case when v_gated and key like 'legal.%'
                           then auth.uid() end,
        approved_at = case when v_gated and key like 'legal.%'
                           then now() end,
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

comment on function public.publish_site_content(text[], jsonb, jsonb) is
  'Moves the named slots'' drafts onto the public site for the caller''s tenant, in one statement so a page publishes atomically (#793). SECURITY DEFINER because `value` is not writable by `authenticated` at all: this is the only way to publish. `p_legal_surface` (#1292) is the collection surface the caller computed for this tenant, stored as legal_surface.<document> for each `legal.*` slot that actually published. `p_approval` (#600) is {"reference", "notes"}, required -- from somebody other than the drafter -- when the tenant has legal_approval.required on and a legal.* slot is among the ones publishing; it is recorded on the rows it approves, and cleared from every other publish so that no approval outlives the text it was given for.';

revoke execute on function public.publish_site_content(text[], jsonb, jsonb) from public;
grant execute on function public.publish_site_content(text[], jsonb, jsonb) to authenticated;

-- 4. Who wrote, who published, and who approved ------------------------------
--
-- `approved_by` joins the three ids this tenant's rows already name, so the
-- panel can say who approved a document rather than showing a uuid. Same
-- narrowing as before: permission-gated, and limited to ids that appear on the
-- caller's own tenant's rows, so it cannot enumerate accounts.

create or replace function public.list_site_content_actors(p_user_ids uuid[])
returns table (user_id uuid, email text, full_name text)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
  where public.has_permission('site_content', 'view')
    and u.id = any(p_user_ids)
    and exists (
      select 1 from public.site_content sc
      where sc.tenant_id = (select public.current_tenant_id())
        and u.id in (sc.updated_by, sc.draft_updated_by, sc.published_by, sc.approved_by)
    );
$$;

-- 5. Self-check --------------------------------------------------------------
--
-- The same check 20260908000000 ran, extended to the four columns above. A
-- direct write grant on any of them would let a publisher record their own
-- approval without one, which is the gate defeated by the shortest possible
-- route.
do $$
declare
  v_columns text;
begin
  select string_agg(distinct column_name, ', ') into v_columns
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'site_content'
    and grantee = 'authenticated'
    and privilege_type in ('INSERT', 'UPDATE')
    and column_name in (
      'value', 'published_at', 'published_by',
      'draft_updated_at', 'draft_updated_by', 'key', 'tenant_id',
      'approved_by', 'approved_at', 'approval_reference', 'review_notes'
    );
  if v_columns is not null then
    raise exception 'site_content is directly writable by authenticated (%); the publish flow can be bypassed', v_columns;
  end if;
end $$;
