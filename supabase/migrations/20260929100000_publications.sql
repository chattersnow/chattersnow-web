-- #1471: publications -- a tenant's periodic publication (a zine, newsletter,
-- magazine or lookbook) on the public site. Part 1 of 3 (#1470): the module,
-- the tables, the bucket and the public read. The portal editor is #1472.
--
-- Five parts:
--
--   1. The module, on by default. Nothing goes live with it: the public
--      section is behind the `publications` page-visibility slot, which is off
--      until the tenant turns it on (src/lib/page-visibility.ts), and a tenant
--      with no published issue has nothing to show anyway.
--   2. A resource, `publications`, seeded from each role's `site_content`
--      grant -- whoever edits the website edits the issues on it.
--   3. `publications` and `publication_pages`, tenant-scoped, RLS on the
--      resource. An issue's slug is unique within the tenant and frozen once
--      the issue has been published, because print and QR codes carry it. An
--      issue cannot be published until every page has alt text and a
--      transcript (WCAG 1.1.1 / 1.4.5: the pages are images of text).
--   4. Two definer views, the only way `anon` reaches either table, serving
--      published issues of the resolved tenant only.
--   5. The public `publication-files` bucket.

-- ---------------------------------------------------------------------------
-- 1. The module
-- ---------------------------------------------------------------------------

insert into public.modules (key, label, description, sort_order, default_enabled, is_core) values
  ('publications', 'Publications',
   'A periodic publication on the public website -- a zine, newsletter, magazine or lookbook -- with a page per issue, readable page images, transcripts and optional PDFs.',
   25, true, false);

-- Seeded for all three plans so provision_tenant(), which reads this table,
-- keeps giving a new tenant a complete set of rows.
insert into public.plan_modules (plan, module_key, enabled)
select p.plan, 'publications', true
from (values ('internal'), ('demo'), ('white_label')) as p(plan);

-- ---------------------------------------------------------------------------
-- 2. The resource
-- ---------------------------------------------------------------------------

insert into public.resources (key, section, label, description, sort_order, module_key) values
  ('publications', 'Administration', 'Publications',
   'The issues of the organization''s periodic publication, their pages, transcripts and files',
   128, 'publications');

-- Mirrors each role's site_content level, every tenant's roles: an issue is
-- website content, and nobody's access changes on the way in.
insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, coalesce(sc.level, 'none')
from public.roles r
cross join public.resources res
left join lateral (
  select rp.level
    from public.role_permissions rp
    join public.resources x on x.id = rp.resource_id
   where rp.role_id = r.id and x.key = 'site_content'
) sc on true
where res.key = 'publications';

-- ---------------------------------------------------------------------------
-- 3. The tables
-- ---------------------------------------------------------------------------

-- Image columns hold object paths in `publication-files`, never URLs, so the
-- origin can differ between the local stack and the hosted project. A
-- `*_renditions` column is the list of resized copies the editor stored
-- (#1472 writes ~480, 960 and 1600px WebP), as `[{ "path", "width" }]`, which
-- is what the public page builds `srcset` from -- Supabase image
-- transformations are Pro-only and Vercel's optimizer has a monthly cap, so the
-- sizes are made once, in the browser, at upload.
create table public.publications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  slug text not null,
  title text not null,
  -- "Fall 2026": the tenant's own label for the issue, shown beside the title.
  season_label text,
  -- A calendar date, not an instant: the day the issue is dated, which is what
  -- the index sorts by.
  publish_date date,
  blurb text,
  cover_path text,
  cover_width integer,
  cover_height integer,
  cover_renditions jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  -- Set by the first publish and never cleared, including by unpublishing: it
  -- is what freezes the slug (see guard_publication_update).
  published_at timestamptz,
  -- A reading-order PDF, offered as "Download".
  reading_pdf_path text,
  reading_pdf_bytes bigint,
  -- A print-ready, possibly imposed PDF, offered as "Print at home". Never the
  -- reading source: an imposed file puts page 1 beside the last page.
  print_pdf_path text,
  print_pdf_bytes bigint,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (tenant_id, id),
  unique (tenant_id, slug),
  constraint publications_status_check check (status in ('draft', 'published')),
  -- Lower-case words joined by single hyphens: `fall-2026`. It is a URL that
  -- will be printed, so it is held to what survives being typed from paper.
  constraint publications_slug_format check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80
  ),
  constraint publications_title_present check (btrim(title) <> ''),
  constraint publications_published_has_date check (
    status <> 'published' or published_at is not null
  ),
  constraint publications_cover_renditions_array check (jsonb_typeof(cover_renditions) = 'array'),
  constraint publications_reading_pdf_size check (
    (reading_pdf_path is null) = (reading_pdf_bytes is null)
  ),
  constraint publications_print_pdf_size check (
    (print_pdf_path is null) = (print_pdf_bytes is null)
  )
);

create index publications_tenant_id_idx on public.publications (tenant_id);

create trigger set_updated_at before update on public.publications
  for each row execute function public.set_updated_at();

comment on table public.publications is
  'Issues of a tenant''s periodic publication (#1470, #1471): a zine, newsletter, magazine or lookbook, served at /publications/<slug>. The slug is unique per tenant and frozen once published_at is set. Image and PDF columns are object paths in the publication-files bucket.';

create table public.publication_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  publication_id uuid not null,
  -- 1-based reading order, which is also the `#page-N` anchor on the public
  -- page. Deferred so the editor can renumber a whole issue in one statement.
  position integer not null,
  image_path text not null,
  width integer not null,
  height integer not null,
  image_renditions jsonb not null default '[]'::jsonb,
  -- Short: "Page 3: comic about the first snow day".
  alt_text text,
  -- Every word on the page, handwriting and lettering included. What a screen
  -- reader user reads instead of the image, and what search engines index.
  transcript text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (tenant_id, id),
  constraint publication_pages_position_unique
    unique (publication_id, position) deferrable initially deferred,
  constraint publication_pages_publication_in_tenant
    foreign key (tenant_id, publication_id)
    references public.publications (tenant_id, id) on delete cascade,
  constraint publication_pages_position_positive check (position > 0),
  constraint publication_pages_dimensions check (width > 0 and height > 0),
  constraint publication_pages_renditions_array check (jsonb_typeof(image_renditions) = 'array')
);

create index publication_pages_tenant_id_idx on public.publication_pages (tenant_id);

create trigger set_updated_at before update on public.publication_pages
  for each row execute function public.set_updated_at();

comment on table public.publication_pages is
  'The pages of one publication issue, in reading order (#1471). Each is an image with alt text and a transcript; an issue cannot be published while any page lacks either.';

-- Whether an issue's pages are complete enough to publish: at least one, and
-- every one with alt text and a transcript.
create or replace function public.publication_pages_missing_text(p_publication_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
    from public.publication_pages p
   where p.publication_id = p_publication_id
     and (nullif(btrim(p.alt_text), '') is null or nullif(btrim(p.transcript), '') is null);
$$;

comment on function public.publication_pages_missing_text(uuid) is
  'How many pages of an issue still lack alt text or a transcript (#1471). Invoker rights: the caller sees the count RLS lets it see.';

revoke execute on function public.publication_pages_missing_text(uuid) from public, anon;
grant execute on function public.publication_pages_missing_text(uuid) to authenticated;

-- The two rules on an issue that RLS cannot express: the slug freezes on first
-- publish, and publishing needs every page's text.
create or replace function public.guard_publication_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.published_at is not null and new.slug is distinct from old.slug then
    raise exception 'PUBLICATION_SLUG_LOCKED'
      using detail = 'An issue''s slug cannot change once it has been published.';
  end if;

  if tg_op = 'UPDATE' then
    new.published_at := coalesce(old.published_at, new.published_at);
  end if;

  if new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());

    if tg_op = 'INSERT' then
      -- A new row has no pages yet.
      raise exception 'PUBLICATION_INCOMPLETE'
        using detail = 'An issue needs at least one page before it can be published.';
    end if;

    if not exists (select 1 from public.publication_pages p where p.publication_id = new.id) then
      raise exception 'PUBLICATION_INCOMPLETE'
        using detail = 'An issue needs at least one page before it can be published.';
    end if;

    if public.publication_pages_missing_text(new.id) > 0 then
      raise exception 'PUBLICATION_INCOMPLETE'
        using detail = 'Every page needs alt text and a transcript before the issue can be published.';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_publication_update() from public, anon, authenticated;

create trigger guard_publication_update
  before insert or update on public.publications
  for each row execute function public.guard_publication_update();

-- The same rule from the other side: a published issue cannot lose a page's
-- text, or its last page. Unpublish first.
create or replace function public.guard_published_publication_pages()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_publication_id uuid := coalesce(new.publication_id, old.publication_id);
begin
  if not exists (
    select 1 from public.publications
     where id = v_publication_id and status = 'published'
  ) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if not exists (
      select 1 from public.publication_pages
       where publication_id = v_publication_id and id <> old.id
    ) then
      raise exception 'PUBLICATION_INCOMPLETE'
        using detail = 'A published issue cannot lose its last page.';
    end if;
    return old;
  end if;

  if nullif(btrim(new.alt_text), '') is null or nullif(btrim(new.transcript), '') is null then
    raise exception 'PUBLICATION_INCOMPLETE'
      using detail = 'A page of a published issue needs alt text and a transcript.';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_published_publication_pages() from public, anon, authenticated;

create trigger guard_published_publication_pages
  before insert or update or delete on public.publication_pages
  for each row execute function public.guard_published_publication_pages();

-- Row-level security. The editor is #1472; these are the rules it lands on.
alter table public.publications enable row level security;
alter table public.publication_pages enable row level security;

create policy "publications select" on public.publications
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('publications', 'view')
  );
create policy "publications insert" on public.publications
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('publications', 'manage')
  );
create policy "publications update" on public.publications
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('publications', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('publications', 'manage')
  );
create policy "publications delete" on public.publications
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('publications', 'manage')
  );

create policy "publication_pages select" on public.publication_pages
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('publications', 'view')
  );
create policy "publication_pages insert" on public.publication_pages
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('publications', 'manage')
  );
create policy "publication_pages update" on public.publication_pages
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('publications', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('publications', 'manage')
  );
create policy "publication_pages delete" on public.publication_pages
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('publications', 'manage')
  );

-- Explicit: `anon` reaches these tables only through the views below.
revoke all on public.publications from anon, authenticated;
revoke all on public.publication_pages from anon, authenticated;
grant select, insert, update, delete on public.publications to authenticated;
grant select, insert, update, delete on public.publication_pages to authenticated;

insert into public.audited_tables (table_name, pk_column, redacted_columns) values
  ('publications', 'id', '{}'),
  ('publication_pages', 'id', '{}');

create trigger audit_log_row after insert or update or delete
  on public.publications
  for each row execute function public.audit_log_row();
create trigger audit_log_row after insert or update or delete
  on public.publication_pages
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 4. The public read
-- ---------------------------------------------------------------------------

-- Definer views, as public_articles (#887): the tables admit `authenticated`
-- only and the public site reads as `anon`. Isolation is public_tenant_id();
-- a draft never leaves, and neither does anything while the module is off --
-- the page gate 404s first, but an off module must not be one direct API call
-- away from its content. The module is read through public_tenant_modules,
-- the view that gate reads, rather than module_enabled_for_tenant(): a
-- function's EXECUTE is checked against the caller even inside a definer
-- view, and that one is service_role only. A missing row reads as on, as
-- everywhere else.
create or replace view public.public_publications as
select
  p.id, p.slug, p.title, p.season_label, p.publish_date, p.blurb,
  p.cover_path, p.cover_width, p.cover_height, p.cover_renditions,
  p.reading_pdf_path, p.reading_pdf_bytes, p.print_pdf_path, p.print_pdf_bytes,
  p.published_at
from public.publications p
where p.tenant_id = public.public_tenant_id()
  and p.status = 'published'
  and coalesce(
    (select m.enabled from public.public_tenant_modules m where m.module_key = 'publications'),
    true
  );

create or replace view public.public_publication_pages as
select
  pg.id, pg.publication_id, pg.position, pg.image_path, pg.width, pg.height,
  pg.image_renditions, pg.alt_text, pg.transcript
from public.publication_pages pg
join public.publications p on p.id = pg.publication_id
where pg.tenant_id = public.public_tenant_id()
  and p.status = 'published'
  and coalesce(
    (select m.enabled from public.public_tenant_modules m where m.module_key = 'publications'),
    true
  );

alter view public.public_publications set (security_barrier = true);
alter view public.public_publication_pages set (security_barrier = true);

grant select on public.public_publications to anon, authenticated;
grant select on public.public_publication_pages to anon, authenticated;
revoke insert, update, delete on public.public_publications from anon, authenticated;
revoke insert, update, delete on public.public_publication_pages from anon, authenticated;

comment on view public.public_publications is
  'The resolved tenant''s published issues, for /publications (#1471). Security definer by design (#887): publications admits `authenticated` only and the public site reads as `anon`. Isolation is tenant_id = public_tenant_id(), status = published and the publications module on. SELECT only -- tenant_isolation_gaps() refuses a write grant.';
comment on view public.public_publication_pages is
  'The pages of the resolved tenant''s published issues, for /publications/<slug> (#1471). Same definer rationale as public_publications; joined to the issue so a draft''s pages never leave.';

-- ---------------------------------------------------------------------------
-- 5. The bucket
-- ---------------------------------------------------------------------------

-- Public, as site-photos (20260921050000) and for the same reason: these files
-- are the public website. Writes are RLS-gated below. Objects live under
-- `{tenant_id}/{publication_id}/{uuid}.{ext}`, so one issue's files are one
-- prefix and the tenant folder is what the policies check.
--
-- 25 MiB covers a PDF; a page image is a few hundred KB after the editor's
-- resize, so this is a PDF's ceiling rather than an image's target.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'publication-files',
  'publication-files',
  true,
  26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "publication-files tenant select" on storage.objects;
create policy "publication-files tenant select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'publication-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.has_permission('publications', 'manage')
  );

-- Exactly two folder levels, tenant then issue. `not current_tenant_is_demo()`
-- for site-photos' reason: the demo hands anonymous visitors admin, and this
-- bucket takes 25 MiB PDFs.
drop policy if exists "publication-files tenant insert" on storage.objects;
create policy "publication-files tenant insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'publication-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and array_length(storage.foldername(name), 1) = 2
    and not public.current_tenant_is_demo()
    and public.has_permission('publications', 'manage')
  );

drop policy if exists "publication-files tenant update" on storage.objects;
create policy "publication-files tenant update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'publication-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and not public.current_tenant_is_demo()
    and public.has_permission('publications', 'manage')
  )
  with check (
    bucket_id = 'publication-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and array_length(storage.foldername(name), 1) = 2
  );

drop policy if exists "publication-files tenant delete" on storage.objects;
create policy "publication-files tenant delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'publication-files'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())::text
    and public.has_permission('publications', 'manage')
  );

-- ---------------------------------------------------------------------------
-- Self-check
-- ---------------------------------------------------------------------------

do $check$
declare
  v_policies text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into v_policies
    from pg_policies
   where schemaname = 'public'
     and tablename in ('publications', 'publication_pages')
     and coalesce(qual, '') || coalesce(with_check, '') not like '%current_tenant_id()%';

  if v_policies is not null then
    raise exception 'publications policies without the tenant predicate: %', v_policies;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.publication_pages'::regclass
       and conname = 'publication_pages_publication_in_tenant'
       and array_length(conkey, 1) = 2
  ) then
    raise exception 'publication_pages.publication_id must reference publications by (tenant_id, id)';
  end if;
end;
$check$;
