-- #894: Learn becomes a tenant-owned article collection.
--
-- `src/app/(public)/learn/` was 1,913 lines across nine `*-data.ts` files --
-- 8 categories and 37 articles, all of them Chatter Snow's snow-sports
-- writing, compiled into the bundle. #831 gated the section behind a
-- `learn` slot at `defaultVisible: false`, which is a correct gate and not an
-- answer: it gives a second organization exactly two options, publish another
-- nonprofit's guides under their own brand or have no Learn section at all.
--
-- The slot registry cannot hold the third option. A slot is a fixed entry --
-- a known key, a known type, a default -- and Learn needs a *collection*: an
-- unbounded number of rows a tenant creates, each with its own address and
-- ordered body. So this is two tables rather than more `site_content` keys.
--
-- What it borrows from `site_content` is everything else, because the draft
-- model there (#793) is the one this needs:
--
--   value                  what the public sees. NULL means nothing is
--                          published; `public_articles` filters those out.
--   has_draft/draft_value  the pending change, stamped by a trigger from
--                          auth.uid() rather than sent by the browser.
--
-- The one thing `site_content` has no equivalent for is **deletion**. A slot
-- reverts to its registry default, so "remove" is expressible as a draft of
-- NULL and the row can stay forever. An article has no default behind it, so
-- the same draft of NULL means *delete this*, and publishing it drops the row.
-- That keeps removal inside the publish gate: taking an article off the live
-- site is a publish, exactly as changing its wording is.
--
-- What is deliberately NOT drafted is **identity**: `slug` on a category and
-- `anchor` on an article are the addresses `/learn/<slug>` and `#<anchor>`,
-- and an address that changes on publish is a broken inbound link either way.
-- Order *is* drafted (`position` / `draft_position`), because reordering a
-- page's sections is an editorial change like any other and a reader should
-- not see half of one.
--
-- Permission: `site_content`, the resource that already governs the words on
-- the public site. Articles are more of those words, edited from the same
-- screen, by the same people; a second resource would add a column to every
-- role's permission matrix that nobody would ever set differently.
--
-- As with `site_content`, `authenticated` holds SELECT only. Every write goes
-- through one of the `security definer` functions below -- with an ordinary
-- grant, anyone holding `site_content:manage` could set `value` straight
-- through PostgREST and publishing would stop being a step.

-- 1. The tables --------------------------------------------------------------

create table public.article_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  position integer not null default 0,
  draft_position integer,
  value jsonb,
  draft_value jsonb,
  has_draft boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  draft_updated_at timestamptz,
  draft_updated_by uuid references auth.users(id),
  published_at timestamptz,
  published_by uuid references auth.users(id),
  unique (tenant_id, slug),
  -- The target of the composite foreign key below: it is what makes an
  -- article physically unable to hang off another tenant's category.
  unique (tenant_id, id)
);

comment on table public.article_categories is
  'A tenant''s article categories -- the /learn index and the pages beneath it (#894). `value` is {title, description}; NULL means nothing published yet.';
comment on column public.article_categories.slug is
  'The /learn/<slug> segment. Identity rather than copy, so it is not drafted: an address that changes on publish breaks inbound links whichever way it moves.';
comment on column public.article_categories.draft_position is
  'The pending order, NULL when the published order stands. Order is drafted because reordering a page is an editorial change and a reader should not see half of one.';

create index article_categories_tenant_id_idx on public.article_categories (tenant_id);

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  category_id uuid not null,
  anchor text not null check (anchor ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  position integer not null default 0,
  draft_position integer,
  value jsonb,
  draft_value jsonb,
  has_draft boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id),
  draft_updated_at timestamptz,
  draft_updated_by uuid references auth.users(id),
  published_at timestamptz,
  published_by uuid references auth.users(id),
  unique (tenant_id, category_id, anchor),
  foreign key (tenant_id, category_id)
    references public.article_categories (tenant_id, id) on delete cascade
);

comment on table public.articles is
  'A tenant''s articles within a category (#894). `value` is the body src/lib/articles.ts declares: title, description, paragraphs, a labelled list, links and a disclaimer. Not a rich text document -- markup beyond that shape is a change to ArticleBody, argued on its own merits.';
comment on column public.articles.anchor is
  'The #fragment the in-page nav links to, unique within its category. Identity, so it is not drafted; see article_categories.slug.';
comment on column public.articles.value is
  'The published body. NULL with has_draft is an article being written; NULL without one is a row the next publish deletes.';

create index articles_tenant_id_idx on public.articles (tenant_id);
create index articles_category_id_idx on public.articles (category_id, position);

create trigger set_updated_at before update on public.article_categories
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.articles
  for each row execute function public.set_updated_at();

-- 2. Attribution is stamped, not sent ----------------------------------------
--
-- The same trigger `site_content` carries, over both tables. Who drafted and
-- who published is read off auth.uid() rather than out of the payload, so it
-- cannot be forged by the person doing it.

create or replace function public.stamp_article_authorship()
returns trigger
language plpgsql
as $$
begin
  if new.has_draft
     and (TG_OP = 'INSERT'
          or (new.draft_value, new.draft_position, new.has_draft)
             is distinct from (old.draft_value, old.draft_position, old.has_draft))
  then
    new.draft_updated_at = now();
    new.draft_updated_by = auth.uid();
  elsif not new.has_draft then
    new.draft_updated_at = null;
    new.draft_updated_by = null;
  end if;

  -- coalesce(auth.uid(), new.updated_by) so a service-role writer with no
  -- session -- provisioning, and the demo tenant's nightly reset -- still
  -- records who it acted for.
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

comment on function public.stamp_article_authorship() is
  'Records who drafted and who published each article and category (#894), from auth.uid() rather than from the client. The same trigger site_content carries.';

create trigger stamp_article_authorship
  before insert or update on public.article_categories
  for each row execute function public.stamp_article_authorship();
create trigger stamp_article_authorship
  before insert or update on public.articles
  for each row execute function public.stamp_article_authorship();

-- 3. RLS ---------------------------------------------------------------------
--
-- SELECT for the editor, gated on `site_content:view`. No insert/update/delete
-- grant at all: the policies are written anyway so that if a write grant is
-- ever restored it lands on rules rather than on nothing.

alter table public.article_categories enable row level security;
alter table public.articles enable row level security;

create policy "article_categories select" on public.article_categories for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'view')
  );
create policy "article_categories insert" on public.article_categories for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
  );
create policy "article_categories update" on public.article_categories for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
  );
create policy "article_categories delete" on public.article_categories for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
    and value is null
  );

create policy "articles select" on public.articles for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'view')
  );
create policy "articles insert" on public.articles for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
  );
create policy "articles update" on public.articles for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
  );
create policy "articles delete" on public.articles for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('site_content', 'manage')
    and value is null
  );

-- Explicit, not assumed: whatever default privileges the schema carries, these
-- two tables admit `authenticated` for reading and nothing else, and `anon`
-- reaches them only through the views below. The self-check at the bottom
-- fails this migration if that is not what landed.
revoke all on public.article_categories from anon, authenticated;
revoke all on public.articles from anon, authenticated;
grant select on public.article_categories to authenticated;
grant select on public.articles to authenticated;

-- 4. The public surface never serves a draft ---------------------------------
--
-- Definer views, for the reason 20260911010000 records: both base tables admit
-- `authenticated` only and the public website reads as `anon`. Isolation is
-- public_tenant_id(); `draft_value` is outside the column list, which is the
-- point of the view.

create or replace view public.public_article_categories as
select id, slug, position, value
from public.article_categories
where tenant_id = public.public_tenant_id()
  and value is not null;

create or replace view public.public_articles as
select a.id, a.category_id, a.anchor, a.position, a.value
from public.articles a
join public.article_categories c on c.id = a.category_id
where a.tenant_id = public.public_tenant_id()
  and a.value is not null
  and c.value is not null;

alter view public.public_article_categories set (security_barrier = true);
alter view public.public_articles set (security_barrier = true);

grant select on public.public_article_categories to anon, authenticated;
grant select on public.public_articles to anon, authenticated;

comment on view public.public_article_categories is
  'The resolved tenant''s published article categories, for /learn (#894). Security definer by design (#887): article_categories admits `authenticated` only and the public site reads as `anon`. Isolation is tenant_id = public_tenant_id() plus a published value; draft_value is outside the column list. SELECT only -- a write grant here would bypass both RLS and the publish flow, and tenant_isolation_gaps() refuses one.';
comment on view public.public_articles is
  'The resolved tenant''s published articles, for /learn/<slug> (#894). Same definer rationale as public_article_categories; also joined to the category so an article cannot outlive the page it renders on.';

-- 5. Only these functions write the tables ------------------------------------

-- A category and every article on it, saved as one draft.
--
-- The unit is the category because that is the unit the editor edits and the
-- unit the reader reads: a page. `p_articles` is the whole ordered list, so
-- position falls out of the array index and an article that is no longer in it
-- gets a pending removal rather than disappearing.
create or replace function public.save_article_drafts(
  p_category jsonb,
  p_articles jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_category_id uuid;
  v_keep uuid[] := '{}';
  v_entry jsonb;
  v_position integer := 0;
  v_id uuid;
begin
  if v_tenant is null then
    raise exception 'NO_TENANT';
  end if;
  if not public.has_permission('site_content', 'manage') then
    raise exception 'FORBIDDEN';
  end if;
  if p_category is null then
    raise exception 'NO_CATEGORY';
  end if;

  v_category_id := nullif(p_category ->> 'id', '')::uuid;

  if v_category_id is null then
    insert into public.article_categories (tenant_id, slug, position, draft_value, has_draft)
    values (
      v_tenant,
      p_category ->> 'slug',
      coalesce((p_category ->> 'position')::integer,
               (select coalesce(max(position), -1) + 1
                from public.article_categories where tenant_id = v_tenant)),
      p_category -> 'value',
      true
    )
    returning id into v_category_id;
  else
    update public.article_categories
    set slug = coalesce(p_category ->> 'slug', slug),
        draft_value = p_category -> 'value',
        has_draft = true
    where tenant_id = v_tenant and id = v_category_id;
    if not found then
      raise exception 'NO_CATEGORY';
    end if;
  end if;

  -- The articles, in the order they arrived: position falls out of the index
  -- rather than being sent, so the list the editor shows and the order the
  -- site renders cannot disagree.
  --
  -- A row with an id is updated in place, anchor included, so renaming the
  -- fragment keeps the article's publication history. One without an id is
  -- new, and `anchor` is its natural key: on conflict it merges with whatever
  -- is already there instead of failing the whole save on a fragment somebody
  -- used once and removed.
  for v_entry in select * from jsonb_array_elements(coalesce(p_articles, '[]'::jsonb))
  loop
    v_id := nullif(v_entry ->> 'id', '')::uuid;

    if v_id is null then
      insert into public.articles (tenant_id, category_id, anchor, position, draft_position, draft_value, has_draft)
      values (v_tenant, v_category_id, v_entry ->> 'anchor', 0, v_position, v_entry -> 'value', true)
      on conflict (tenant_id, category_id, anchor) do update
        set draft_position = excluded.draft_position,
            draft_value = excluded.draft_value,
            has_draft = true
      returning id into v_id;
    else
      update public.articles
      set anchor = coalesce(v_entry ->> 'anchor', anchor),
          draft_position = v_position,
          draft_value = v_entry -> 'value',
          has_draft = true
      where tenant_id = v_tenant and category_id = v_category_id and id = v_id;
      if not found then
        raise exception 'NO_ARTICLE';
      end if;
    end if;

    v_keep := v_keep || v_id;
    v_position := v_position + 1;
  end loop;

  -- Anything left on the category that this save did not name is a removal.
  -- A row that was never published leaves nothing behind worth keeping; one
  -- that was gets a draft of NULL, so the deletion goes through publish like
  -- every other change.
  delete from public.articles
  where tenant_id = v_tenant
    and category_id = v_category_id
    and not (id = any(v_keep))
    and value is null;

  update public.articles
  set draft_value = null,
      draft_position = null,
      has_draft = true
  where tenant_id = v_tenant
    and category_id = v_category_id
    and not (id = any(v_keep))
    and value is not null;

  return v_category_id;
end;
$$;

comment on function public.save_article_drafts(jsonb, jsonb) is
  'Stages a category and its whole ordered article list as drafts (#894). Nothing here reaches the public site; publish_article_category() does that. An article missing from p_articles is a pending removal, not an immediate one.';

-- Stages the order of the /learn index itself.
create or replace function public.reorder_article_categories(p_ids uuid[])
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
  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  update public.article_categories c
  set draft_position = ordered.position,
      has_draft = true
  from (
    select id, ordinality - 1 as position
    from unnest(p_ids) with ordinality as t(id, ordinality)
  ) as ordered
  where c.tenant_id = v_tenant
    and c.id = ordered.id
    and c.draft_position is distinct from ordered.position;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

-- A pending removal of a whole category, its articles included.
create or replace function public.delete_article_category(p_id uuid)
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

  -- Never published: nothing on the live site to take away, so it simply goes
  -- (and the cascade takes its articles).
  delete from public.article_categories
  where tenant_id = v_tenant and id = p_id and value is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    return v_count;
  end if;

  update public.articles
  set draft_value = null, draft_position = null, has_draft = true
  where tenant_id = v_tenant and category_id = p_id;

  update public.article_categories
  set draft_value = null, draft_position = null, has_draft = true
  where tenant_id = v_tenant and id = p_id;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

comment on function public.delete_article_category(uuid) is
  'Stages the removal of a category and everything on it (#894). A category that was never published goes immediately; a published one is removed by the next publish, so taking a live page down is a publish like any other change.';

-- The one call that changes what a visitor sees.
create or replace function public.publish_article_category(p_id uuid)
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

  update public.articles
  set value = draft_value,
      position = coalesce(draft_position, position),
      draft_value = null,
      draft_position = null,
      has_draft = false
  where tenant_id = v_tenant and category_id = p_id and has_draft;
  get diagnostics v_count = row_count;

  update public.article_categories
  set value = draft_value,
      position = coalesce(draft_position, position),
      draft_value = null,
      draft_position = null,
      has_draft = false
  where tenant_id = v_tenant and id = p_id and has_draft;

  -- A published draft of NULL is a deletion; the row has served its purpose
  -- as the record of a pending removal and goes now.
  delete from public.articles
  where tenant_id = v_tenant and category_id = p_id and value is null and not has_draft;
  delete from public.article_categories
  where tenant_id = v_tenant and id = p_id and value is null and not has_draft;

  return v_count;
end;
$$;

comment on function public.publish_article_category(uuid) is
  'Moves a category and its articles'' drafts onto the public site in one statement, so a page publishes atomically (#894). SECURITY DEFINER because `value` is not writable by `authenticated` at all: this is the only way to publish.';

create or replace function public.discard_article_drafts(p_id uuid)
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

  -- Rows that were only ever a draft leave nothing behind worth keeping.
  delete from public.articles
  where tenant_id = v_tenant and category_id = p_id and value is null;

  update public.articles
  set draft_value = null, draft_position = null, has_draft = false
  where tenant_id = v_tenant and category_id = p_id and has_draft;
  get diagnostics v_count = row_count;

  delete from public.article_categories
  where tenant_id = v_tenant and id = p_id and value is null;

  update public.article_categories
  set draft_value = null, draft_position = null, has_draft = false
  where tenant_id = v_tenant and id = p_id and has_draft;

  return v_count;
end;
$$;

revoke execute on function public.save_article_drafts(jsonb, jsonb) from public;
revoke execute on function public.reorder_article_categories(uuid[]) from public;
revoke execute on function public.delete_article_category(uuid) from public;
revoke execute on function public.publish_article_category(uuid) from public;
revoke execute on function public.discard_article_drafts(uuid) from public;
grant execute on function public.save_article_drafts(jsonb, jsonb) to authenticated;
grant execute on function public.reorder_article_categories(uuid[]) to authenticated;
grant execute on function public.delete_article_category(uuid) to authenticated;
grant execute on function public.publish_article_category(uuid) to authenticated;
grant execute on function public.discard_article_drafts(uuid) to authenticated;

-- 6. Who wrote and who published ---------------------------------------------
--
-- The same shape as list_site_content_actors (20260908000000): permission-gated
-- and narrowed to ids this tenant's own rows already name, so it cannot
-- enumerate accounts.

create or replace function public.list_article_actors(p_user_ids uuid[])
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
    and (
      exists (
        select 1 from public.article_categories c
        where c.tenant_id = (select public.current_tenant_id())
          and u.id in (c.updated_by, c.draft_updated_by, c.published_by)
      )
      or exists (
        select 1 from public.articles a
        where a.tenant_id = (select public.current_tenant_id())
          and u.id in (a.updated_by, a.draft_updated_by, a.published_by)
      )
    );
$$;

revoke execute on function public.list_article_actors(uuid[]) from public;
grant execute on function public.list_article_actors(uuid[]) to authenticated;

-- 7. Audit -------------------------------------------------------------------
--
-- What the public site says is a record worth keeping, the same argument
-- site_content makes.

insert into public.audited_tables (table_name) values
  ('article_categories'), ('articles');

create trigger audit_log_row after insert or update or delete on public.article_categories
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete on public.articles
  for each row execute function public.audit_log_row();

-- 8. Self-checks --------------------------------------------------------------

do $$
declare
  v_gaps text;
begin
  select string_agg(p.tablename || '.' || p.policyname, ', ') into v_gaps
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('article_categories', 'articles')
    and coalesce(p.qual, '') !~ 'tenant_id'
    and coalesce(p.with_check, '') !~ 'tenant_id';
  if v_gaps is not null then
    raise exception 'article policies without a tenant predicate: %', v_gaps;
  end if;
end $$;

-- The grant surgery, checked the way 20260908000000 checks site_content's: if
-- either table becomes writable by `authenticated`, publishing has a bypass.
do $$
declare
  v_columns text;
begin
  select string_agg(distinct table_name || '.' || column_name, ', ') into v_columns
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name in ('article_categories', 'articles')
    and grantee = 'authenticated'
    and privilege_type in ('INSERT', 'UPDATE');
  if v_columns is not null then
    raise exception 'articles are directly writable by authenticated (%); the publish flow can be bypassed', v_columns;
  end if;
end $$;
