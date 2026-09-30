-- #1472: the publications editor. Part 2 of 3 (#1470); the tables, the bucket
-- and their rules are 20260929100000.
--
-- One function, `save_publication()`, so that an issue and its whole ordered
-- page list are written in one transaction. The editor sends every page it is
-- showing, in reading order: a page it no longer names is removed, a page
-- without an id is added, and every position is rewritten. Separate PostgREST
-- calls could leave an issue half-reordered, and a published issue half-saved
-- -- the one state the public page must never show.
--
-- Invoker rights, deliberately. RLS on both tables already says who may write
-- (`publications:manage`, own tenant), and the two guard triggers already hold
-- the slug freeze and the alt-text-and-transcript rule; a definer function
-- would have to restate all of it. Status is not written here: publishing is a
-- plain update of `status`, which the guard checks the same way.

create or replace function public.save_publication(
  p_id uuid,
  p_issue jsonb,
  p_pages jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_page jsonb;
  v_position integer := 0;
  v_kept uuid[] := '{}';
  v_page_id uuid;
begin
  if jsonb_typeof(p_pages) is distinct from 'array' then
    raise exception 'PUBLICATION_PAGES_INVALID'
      using detail = 'Pages must be a list.';
  end if;

  update public.publications set
    slug = p_issue->>'slug',
    title = p_issue->>'title',
    season_label = nullif(btrim(p_issue->>'season_label'), ''),
    publish_date = nullif(p_issue->>'publish_date', '')::date,
    blurb = nullif(btrim(p_issue->>'blurb'), ''),
    cover_path = p_issue->>'cover_path',
    cover_width = (p_issue->>'cover_width')::integer,
    cover_height = (p_issue->>'cover_height')::integer,
    cover_renditions = coalesce(p_issue->'cover_renditions', '[]'::jsonb),
    reading_pdf_path = p_issue->>'reading_pdf_path',
    reading_pdf_bytes = (p_issue->>'reading_pdf_bytes')::bigint,
    print_pdf_path = p_issue->>'print_pdf_path',
    print_pdf_bytes = (p_issue->>'print_pdf_bytes')::bigint,
    updated_by = auth.uid()
  where id = p_id;

  -- RLS hides a row the caller may not write, so "no row" is also "no right".
  if not found then
    raise exception 'PUBLICATION_NOT_FOUND'
      using detail = 'That issue does not exist, or you cannot edit it.';
  end if;

  -- Adds and updates first, removals last: a published issue cannot lose its
  -- last page (guard_published_publication_pages), and replacing every page of
  -- one would otherwise trip that before the new pages existed.
  for v_page in select value from jsonb_array_elements(p_pages) loop
    v_position := v_position + 1;
    v_page_id := nullif(v_page->>'id', '')::uuid;

    if v_page_id is null then
      insert into public.publication_pages (
        tenant_id, publication_id, position, image_path, width, height,
        image_renditions, alt_text, transcript
      )
      select p.tenant_id, p.id, v_position,
             v_page->>'image_path',
             (v_page->>'width')::integer,
             (v_page->>'height')::integer,
             coalesce(v_page->'image_renditions', '[]'::jsonb),
             nullif(btrim(v_page->>'alt_text'), ''),
             nullif(btrim(v_page->>'transcript'), '')
        from public.publications p
       where p.id = p_id
      returning id into v_page_id;
    else
      update public.publication_pages set
        position = v_position,
        alt_text = nullif(btrim(v_page->>'alt_text'), ''),
        transcript = nullif(btrim(v_page->>'transcript'), ''),
        updated_by = auth.uid()
      where id = v_page_id and publication_id = p_id;

      if not found then
        raise exception 'PUBLICATION_PAGES_INVALID'
          using detail = 'A page in the list does not belong to this issue.';
      end if;
    end if;

    v_kept := v_kept || v_page_id;
  end loop;

  delete from public.publication_pages
   where publication_id = p_id
     and id <> all (v_kept);
end;
$$;

comment on function public.save_publication(uuid, jsonb, jsonb) is
  'Writes one publication issue''s details and its whole ordered page list in one transaction (#1472). Invoker rights: RLS and the #1471 guard triggers decide what may be written. Does not change status.';

revoke execute on function public.save_publication(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_publication(uuid, jsonb, jsonb) to authenticated;
