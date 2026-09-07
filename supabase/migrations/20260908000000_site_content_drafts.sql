-- A draft/publish split for `site_content` (#793).
--
-- Until now every save in Administration > Site Content went straight to the
-- live public site: `saveSiteContentAction` upserted the row and the next
-- visitor read it. There was no state between "being written" and "visible to
-- the public", so copy could not be drafted, reviewed or previewed, and the
-- only undo was retyping the previous words from memory.
--
-- The model after this migration, per slot:
--
--   value                  what the public sees. NULL means the tenant has no
--                          override and the page renders the registry default
--                          from `src/lib/site-content.ts`. A row can sit at
--                          NULL after a revert; that is a record of the revert,
--                          and `public_site_content` filters it out.
--   has_draft/draft_value  the pending change. `has_draft` with a NULL
--                          `draft_value` is the "back to the registry default"
--                          draft -- publishing it clears the override.
--
-- The table is no longer written by the client at all. `authenticated` keeps
-- only SELECT; every write goes through one of the three functions below.
-- That is what makes publishing a step rather than a side effect: with an
-- ordinary grant, anyone holding `site_content:manage` could set `value`
-- directly through PostgREST and skip the whole flow -- and the approval gate
-- for the legal documents, which lands on top of this, would be skippable the
-- same way. It also means `draft_updated_by` and `published_by` are stamped by
-- a trigger from `auth.uid()` rather than sent by the browser, so "who wrote
-- this" and "who published it" cannot be forged by the person doing it.
--
-- Anything added to this table later is un-writable by `authenticated` by
-- default, which is the safe direction: a new column has to be handled in the
-- functions below to be settable at all.

-- 1. The draft columns -------------------------------------------------------

alter table public.site_content
  alter column value drop not null,
  add column draft_value jsonb,
  add column has_draft boolean not null default false,
  add column draft_updated_at timestamptz,
  add column draft_updated_by uuid references auth.users(id),
  add column published_at timestamptz,
  add column published_by uuid references auth.users(id);

comment on column public.site_content.value is
  'The published copy the public site serves. NULL means no override: the page renders the slot default from the registry in src/lib/site-content.ts.';
comment on column public.site_content.draft_value is
  'The pending copy, meaningful only when has_draft. NULL with has_draft is a draft that reverts the slot to the registry default.';
comment on column public.site_content.has_draft is
  'Whether draft_value is a pending change. Kept separate from draft_value because NULL is itself a meaningful draft.';

-- Every row that exists today was published the moment it was written. The
-- triggers come off for the backfill: `set_updated_at` would stamp every row
-- with now() and a null actor (there is no session in a migration), erasing
-- the authorship this backfill is reading, and `audit_log_row` would write 86
-- actorless "update" entries into the tenant's own audit log.
alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

update public.site_content
set published_at = updated_at,
    published_by = updated_by;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;

-- 2. The public surface never serves a draft ---------------------------------

-- Not `security_invoker`: this reads the base table as the owner, which is how
-- `anon` can see published copy at all. Only SELECT is granted on it, and it
-- must stay that way -- a write grant here would bypass both RLS and the
-- column grants below in one line.
create or replace view public.public_site_content as
select key, value
from public.site_content
where tenant_id = public.public_tenant_id()
  and value is not null;

grant select on public.public_site_content to anon, authenticated;

-- 3. Attribution is stamped, not sent ----------------------------------------

create or replace function public.stamp_site_content_authorship()
returns trigger
language plpgsql
as $$
begin
  -- A draft is stamped when it appears or changes, and cleared when it goes.
  if new.has_draft
     and (TG_OP = 'INSERT'
          or (new.draft_value, new.has_draft) is distinct from (old.draft_value, old.has_draft))
  then
    new.draft_updated_at = now();
    new.draft_updated_by = auth.uid();
  elsif not new.has_draft then
    new.draft_updated_at = null;
    new.draft_updated_by = null;
  end if;

  -- `coalesce(auth.uid(), new.updated_by)` so a service-role writer with no
  -- session -- `seed_demo_tenant` is the one that exists -- still records who
  -- it acted for instead of leaving the demo site looking unpublished.
  if TG_OP = 'INSERT' then
    if new.value is not null and new.published_at is null then
      new.published_at = now();
      new.published_by = coalesce(auth.uid(), new.updated_by);
    end if;
  elsif new.value is distinct from old.value then
    new.published_at = now();
    new.published_by = coalesce(auth.uid(), new.updated_by);
  end if;

  return new;
end;
$$;

comment on function public.stamp_site_content_authorship() is
  'Records who drafted and who published each slot (#793). A trigger rather than a column the client sets, so the four-eyes rule the legal-document approval gate depends on cannot be defeated by sending someone else''s id.';

create trigger stamp_site_content_authorship
  before insert or update on public.site_content
  for each row execute function public.stamp_site_content_authorship();

-- 4. Only these functions write the table ------------------------------------

revoke insert, update, delete on public.site_content from authenticated;

-- The policies stay, tenant-scoped and permission-checked, so that if a write
-- grant is ever restored it lands on rules rather than on nothing. Delete is
-- narrowed to rows that publish nothing: deleting a published row would
-- unpublish it without going through `publish_site_content`, which is the one
-- thing this whole migration exists to prevent.
drop policy if exists "site_content delete" on public.site_content;
create policy "site_content delete" on public.site_content for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
    and value is null
  );

create or replace function public.save_site_content_drafts(p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_count integer;
begin
  if v_tenant is null then
    raise exception 'NO_TENANT';
  end if;
  if not public.has_permission('site_content', 'manage') then
    raise exception 'FORBIDDEN';
  end if;
  if p_entries is null or jsonb_array_length(p_entries) = 0 then
    return 0;
  end if;

  insert into public.site_content (tenant_id, key, draft_value, has_draft)
  select v_tenant,
         entry ->> 'key',
         case when jsonb_typeof(entry -> 'value') = 'null' then null
              else entry -> 'value' end,
         true
  from jsonb_array_elements(p_entries) as entry
  on conflict (tenant_id, key) do update
    set draft_value = excluded.draft_value,
        has_draft = true;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

comment on function public.save_site_content_drafts(jsonb) is
  'Stages copy as a draft for the caller''s tenant (#793). Takes [{"key": ..., "value": ...}]; a JSON null value is the draft that reverts the slot to the registry default. The shape of each value is checked against the slot registry in the server action, the same as before.';

create or replace function public.discard_site_content_drafts(p_keys text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_count integer;
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

  -- A slot that was only ever a draft leaves nothing behind worth keeping.
  delete from public.site_content
  where tenant_id = v_tenant
    and key = any(p_keys)
    and value is null;

  update public.site_content
  set draft_value = null,
      has_draft = false
  where tenant_id = v_tenant
    and key = any(p_keys)
    and has_draft;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

create or replace function public.publish_site_content(p_keys text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_count integer;
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
  update public.site_content
  set value = draft_value,
      draft_value = null,
      has_draft = false
  where tenant_id = v_tenant
    and key = any(p_keys)
    and has_draft;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

comment on function public.publish_site_content(text[]) is
  'Moves the named slots'' drafts onto the public site for the caller''s tenant, in one statement so a page publishes atomically (#793). SECURITY DEFINER because `value` is not writable by `authenticated` at all: this is the only way to publish.';

revoke execute on function public.save_site_content_drafts(jsonb) from public;
revoke execute on function public.discard_site_content_drafts(text[]) from public;
revoke execute on function public.publish_site_content(text[]) from public;
grant execute on function public.save_site_content_drafts(jsonb) to authenticated;
grant execute on function public.discard_site_content_drafts(text[]) to authenticated;
grant execute on function public.publish_site_content(text[]) to authenticated;

-- 5. Who wrote and who published --------------------------------------------
--
-- The editor shows "published by" against a slot, and the ids on the row are
-- useless without names. `list_portal_users()` needs `administration:manage`,
-- which a `site_content:manage` holder need not have, so this follows
-- `list_expense_actors` (20260906090000): permission-gated, and narrowed to
-- ids this tenant's own rows already name, so it cannot enumerate accounts.

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
        and u.id in (sc.updated_by, sc.draft_updated_by, sc.published_by)
    );
$$;

revoke execute on function public.list_site_content_actors(uuid[]) from public;
grant execute on function public.list_site_content_actors(uuid[]) to authenticated;

-- 6. Self-checks -------------------------------------------------------------

-- The same tenant-predicate check 20260906130000 runs.
do $$
declare
  v_gaps text;
begin
  select string_agg(p.policyname, ', ') into v_gaps
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'site_content'
    and coalesce(p.qual, '') !~ 'tenant_id'
    and coalesce(p.with_check, '') !~ 'tenant_id';
  if v_gaps is not null then
    raise exception 'site_content policies without a tenant predicate: %', v_gaps;
  end if;
end $$;

-- And a check that the grant surgery above actually landed. If any of these
-- becomes writable by `authenticated` again, publishing has a bypass and the
-- approval gate that builds on it has one too. `column_privileges` unions the
-- table-level ACL with the column ACLs, so this also catches a blanket
-- `grant all on site_content to authenticated`; the privilege filter is what
-- keeps the still-correct table-wide SELECT grant from tripping it.
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
      'draft_updated_at', 'draft_updated_by', 'key', 'tenant_id'
    );
  if v_columns is not null then
    raise exception 'site_content is directly writable by authenticated (%); the publish flow can be bypassed', v_columns;
  end if;
end $$;
