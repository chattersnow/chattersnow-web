-- #864: Chatter Snow's published privacy policy names Resend, which handles
-- every email the site sends.
--
-- "Who can see it" listed Supabase, Vercel and Google and nothing else. Since
-- #488 the application sends its outbound mail through Resend, and since #857
-- it does so per tenant -- a registration confirmation, a reply to a contact
-- message, a task reminder, the weekly ops report. Every one of those carries a
-- recipient's email address, and usually their name, to a processor the page
-- did not name. The platform's own default (src/lib/legal-defaults.ts, #858)
-- has named Resend since it was written, which is how the gap surfaced: the two
-- lists were read side by side and only one of them was current.
--
-- #858 deliberately did not fix it. That migration moved Chatter Snow's text
-- into its own rows without editing a word, because adding a subprocessor to a
-- published privacy policy is a content decision rather than something to slip
-- into a pure move. This is that decision, made separately and on the record.
--
-- The wording is the platform default's line verbatim, so the two lists stay in
-- step and a reader comparing them finds the same promise. The board can reword
-- it from Administration > Site Content at any time; the guard below is written
-- so that a later edit wins over this migration rather than the other way
-- round.
--
-- `last_updated` moves in the same statement. A subprocessor added without
-- moving the date is exactly the failure the date exists to prevent, and the
-- two must not be able to come apart -- hence one `update`, not two.
--
-- The rest of the list was checked while it was open, and nothing else is
-- missing. The deployment's only outbound destinations for personal data are
-- Supabase (database, storage, portal sign-in), Vercel (hosting and aggregate
-- analytics), Resend (mail) and Google (optional portal sign-in) -- the four
-- external services `process.env` names, plus hosting. Fonts are self-hosted at
-- build time by `next/font`, and the `drive.google.com` images in
-- `next.config.ts` are fetched server-side by the image optimizer, so neither
-- sends a visitor's address anywhere.
--
-- Nothing is published by this migration. /privacy still 404s: whether these
-- routes are served is `LEGAL_PAGES_PUBLISHED` in src/lib/legal-pages.ts, which
-- is false (#859, #769). This has to be right before that flag comes off, which
-- is why it is being fixed now rather than then.
--
-- The guard, and what it deliberately declines to do
-- --------------------------------------------------
-- The update matches only where the provider list is still exactly the four
-- lines 20260909020000 seeded and `last_updated` is still that migration's
-- date. A row someone has since edited from Administration > Site Content is
-- newer than this and is left alone -- if the board has already added Resend,
-- or reworded the list, or moved the date, this is a no-op and the board's
-- version stands. On a database with no `chatter-snow` tenant (a fresh local or
-- CI database bootstraps as `example-nonprofit`, see docs/tenants.md) it is a
-- no-op as well, which leaves CI exercising the neutral default.
--
-- The section and paragraph are found by id and by text rather than by fixed
-- index, so inserting a paragraph into that section upstream cannot silently
-- rewrite the wrong one.
--
-- A pending *draft* of this document is not touched. If someone has one open in
-- the editor it was written before this migration and will not contain Resend,
-- so publishing it would drop the line again. There is no way to fix that from
-- here without overwriting someone's unpublished work; #601 is where this
-- becomes an edit the board makes itself.
--
-- Triggers off for the same reason as 20260908050000: `set_updated_at` would
-- stamp the row with a null actor and `audit_log_row` would write an audit entry
-- for a change no person made. `stamp_site_content_authorship` stays on -- it is
-- what moves `published_at`.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with target as (
  select
    sc.tenant_id,
    sc.key,
    (section.ordinality - 1)::text as section_index,
    (paragraph.ordinality - 1)::text as paragraph_index
  from public.site_content as sc
  join public.tenants as t on t.id = sc.tenant_id
  cross join lateral jsonb_array_elements(sc.value -> 'sections')
    with ordinality as section(value, ordinality)
  cross join lateral jsonb_array_elements_text(section.value -> 'paragraphs')
    with ordinality as paragraph(value, ordinality)
  where t.slug = 'chatter-snow'
    and sc.key = 'legal.privacy'
    and sc.value ->> 'last_updated' = 'September 5, 2026'
    and section.value ->> 'id' = 'who-can-see-it'
    and paragraph.value = $old$- **Supabase** — hosts our database and handles portal sign-in.
- **Vercel** — hosts this website and provides the aggregate traffic counts we use to see which pages get visited.
- **Google** — only if you choose to sign in to the portal with a Google account.$old$
)
update public.site_content as sc
set value = jsonb_set(
      jsonb_set(
        sc.value,
        array['sections', target.section_index, 'paragraphs', target.paragraph_index],
        to_jsonb($new$- **Supabase** — hosts our database and handles portal sign-in.
- **Vercel** — hosts this website and provides the aggregate traffic counts we use to see which pages get visited.
- **Resend** — delivers the email this site sends, such as a confirmation or a reply to something you submitted.
- **Google** — only if you choose to sign in to the portal with a Google account.$new$::text)
      ),
      '{last_updated}',
      to_jsonb('September 9, 2026'::text)
    ),
    published_at = now()
from target
where sc.tenant_id = target.tenant_id
  and sc.key = target.key;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
