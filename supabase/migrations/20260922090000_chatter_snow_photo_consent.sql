-- #599: Chatter Snow's own photo and media consent scope, and its privacy
-- policy catching up with what the registration form now asks.
--
-- Two writes, both to this one tenant's rows, both content decisions rather
-- than platform behaviour. The mechanism shipped in 20260922070000 and is
-- identical on every tenant; the words below are Chatter Snow's, and the shape
-- is exactly 20260922060000's.
--
-- 1. THE SCOPE. `events.photo_consent` is blank for every tenant by design --
--    what an organization does with a photo of somebody's face is off-platform
--    and unknowable from this codebase, and a scope the platform invented would
--    be a commitment made on a tenant's behalf that a registrant then consented
--    to (`docs/legal-basis.md` rule 2). Chatter Snow has already published the
--    answer in three places, so nothing here is new:
--
--      - its terms of use ("photos-and-content", seeded by 20260909020000) say
--        photos and video are taken at events and used for Chatter Snow's own
--        communications, and name info@chattersnow.org as the takedown route;
--      - its code of conduct says the same in its own words -- "our own
--        newsletters, site, and social accounts" -- and that you can tell any
--        organizer you would rather not be photographed, and that it holds for
--        the rest of the event;
--      - the same document asks people to ask before photographing anyone and
--        to stop if they say no.
--
--    The paragraphs below restate those three, in the second person, at the
--    point where somebody is answering. They add no destination the published
--    documents do not already name: no press, no sponsors, no funder reports.
--    Restating your own published policy where somebody is typing is a factual
--    correction rather than a new commitment, which is why it ships here
--    instead of waiting in #1320. The record is
--    planning/chatter-snow/legal/2026-09-22-photo-and-media-consent.md.
--
--    They also do not link /code-of-conduct or /terms. Those routes 404 until
--    the board adopts the documents (#859), and a scope pointing at a page
--    nobody can open is worse than one that stands on its own -- the same call
--    20260922060000 made.
--
-- 2. THE POLICY. Chatter Snow serves its own privacy policy, so the platform
--    default's new sentence does not reach it. Its "What we collect, and why"
--    bullet for event registration describes a form that no longer exists.
--
--    `last_updated` does NOT move, and that is deliberate rather than an
--    oversight: 20260922060000 already moved it to September 22, 2026 earlier
--    today, and the field is a date. A tenant's own citable version history is
--    `legal_document_versions`, written only by `publish_site_content()`, and a
--    migration writing `site_content` directly bypasses it either way -- the
--    consequence 20260922060000 recorded and this one inherits unchanged.
--
-- Both writes are scoped by slug, like 20260922060000: the demo and platform
-- tenants must not inherit one nonprofit's photo policy, and on a database with
-- no `chatter-snow` tenant (a fresh local or CI database bootstraps as
-- `example-nonprofit`, see docs/tenants.md) both are no-ops -- which leaves CI
-- exercising the blank slot and the no-consent registration path, the state
-- almost every tenant is in and the one that must never break.
--
-- The guards are the established ones. The slot insert is `on conflict do
-- nothing`, because a row somebody has already written from Website > Pages is
-- newer than anything a migration knows. The policy update matches only where
-- the bullet is still exactly the text 20260922060000 left and `last_updated`
-- is still that migration's date, so a board edit since then wins over this
-- migration rather than the other way round. A pending *draft* is untouched,
-- with the consequence #864 recorded: publishing a draft written before today
-- drops the sentence again.
--
-- Triggers off for the write, the same reasoning as 20260922060000:
-- `set_updated_at` would stamp the row with a null actor and `audit_log_row`
-- would write an audit entry for a change no person made.
-- `stamp_site_content_authorship` stays on -- it is what moves `published_at`.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

-- 1. The scope
with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.site_content (tenant_id, key, value, published_at)
select tenant.id, v.key, v.value::jsonb, now()
from tenant, (values
  ('events.photo_consent', '["We take photos and video at our events and use them in our own newsletters, on this site, and on our social media accounts. That is the whole of it — we do not sell photos and we do not pass them to anyone else to use.","You do not have to agree, and saying no changes nothing about your spot. Either way you can tell any organizer on the day that you would rather not be photographed, and that holds for the rest of the event. If a photo of you is already up and you would rather it were not, email info@chattersnow.org and we will take it down."]')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

-- 2. The policy
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
    and sc.value ->> 'last_updated' = 'September 22, 2026'
    and section.value ->> 'id' = 'what-we-collect'
    and paragraph.value like '%**[Event registration](/events)**%'
)
update public.site_content as sc
set value = jsonb_set(
      sc.value,
      array['sections', target.section_index, 'paragraphs', target.paragraph_index],
      to_jsonb(
        replace(
          (sc.value #>> array['sections', target.section_index, 'paragraphs', target.paragraph_index]),
          $old$only our board and leads can see those two contacts, and we clear both with the rest of your details on the schedule below.$old$,
          $new$only our board and leads can see those two contacts, and we clear both with the rest of your details on the schedule below. We also ask whether you are happy to be photographed or recorded. We keep whichever answer you give — including a no, so that everyone helping run the event knows — with the date and a copy of what you were asked, and you can change your mind at any time from your registration page or by emailing us.$new$
        )
      )
    ),
    published_at = now()
from target
where sc.tenant_id = target.tenant_id
  and sc.key = target.key;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
