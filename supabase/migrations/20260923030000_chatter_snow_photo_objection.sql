-- #1376: Chatter Snow's own four paragraphs catching up with the reversal.
--
-- Chatter Snow serves its own three legal documents (20260909020000) and its
-- own `events.photo_consent` paragraphs (20260922090000), so NONE of the
-- platform-default edits in `src/lib/legal-defaults.ts` reach it. Four rows
-- say, in this tenant's own voice, that photographing participants rests on
-- "the consent process described at registration" -- a process that no longer
-- exists. Left alone they would be the only surfaces still describing the box
-- #599 shipped and #1376 removed.
--
-- The idiom is 20260922090000's exactly: every statement scoped by
-- `tenants.slug = 'chatter-snow'`, every write a guarded replace of an exact
-- string so a board edit since then wins over this migration rather than the
-- other way round, `set_updated_at` and `audit_log_row` disabled around the
-- writes and re-enabled after (a null actor would be stamped on the row and an
-- audit entry written for a change no person made), and
-- `stamp_site_content_authorship` left on because it is what moves
-- `published_at`.
--
-- On a database with no `chatter-snow` tenant all four are clean no-ops. Local
-- and CI bootstrap as `example-nonprofit` (docs/tenants.md), which is what
-- keeps CI exercising the blank-slot path -- no paragraphs, no notice, a
-- registration form byte-identical to the one before #599, and the state
-- almost every tenant is in.
--
-- WHAT EACH WRITE SAYS
--
-- 1. `events.photo_consent`, paragraph 2. Paragraph 1 stands unchanged -- "we
--    do not sell photos and we do not pass them to anyone else" is as true as
--    it was. Paragraph 2 opens "You do not have to agree, and saying no
--    changes nothing about your spot", which #1376 makes false: registering is
--    the agreement. The replacement says so and then names all three objection
--    routes, because these paragraphs are the tenant's own claim and the
--    platform's sentence beneath them only describes the mechanism.
--
--    Note this is an UPDATE matching the exact old string, not the `on
--    conflict do nothing` insert 20260922090000 used: a row now exists.
--
-- 2. `legal.privacy` -- replaces the sentence 20260922090000 appended to the
--    event-registration bullet, guarded additionally on `last_updated` still
--    being that migration's 'September 22, 2026'.
--
-- 3. `legal.terms`, the `photos-and-content` paragraph seeded by
--    20260909020000. The takedown paragraph after it is untouched, including
--    "once an image has been shared onward by someone else, that's out of our
--    hands" -- which is what stops "photos can always be deleted" being a
--    promise Chatter Snow cannot keep.
--
-- 4. `legal.code_of_conduct`, the photo paragraph. It keeps "you can tell any
--    organizer you'd rather not be photographed, and that holds for the rest
--    of the event", which was already the right sentence and is now the
--    primary route rather than a supplement to a box.
--
-- DECISION TO FLAG: `last_updated` DOES NOT MOVE ON ANY OF THE THREE
-- DOCUMENTS, and that is deliberate rather than an oversight -- the same gap
-- 20260922090000 recorded and this migration inherits unchanged. A tenant's
-- citable version history is `legal_document_versions`, written only by
-- `publish_site_content()`, and a migration writing `site_content` directly
-- bypasses it. Bumping the date here would advertise a new version with no row
-- behind it. The recommendation is to take these four paragraphs to the board
-- and let them publish through Website > Pages, which writes the version row
-- and moves the date together. (/terms and /code-of-conduct 404 until the
-- board adopts them, #859, so nobody is reading a stale date in the meantime.)
--
-- A pending DRAFT is untouched, with the consequence #864 recorded: publishing
-- a draft written before today puts the old wording back.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

-- 1. The registration-form paragraphs
with target as (
  select sc.tenant_id, (p.ordinality - 1)::text as paragraph_index
  from public.site_content as sc
  join public.tenants as t on t.id = sc.tenant_id
  cross join lateral jsonb_array_elements_text(sc.value)
    with ordinality as p(paragraph, ordinality)
  where t.slug = 'chatter-snow'
    and sc.key = 'events.photo_consent'
    and jsonb_typeof(sc.value) = 'array'
    and p.paragraph = $old$You do not have to agree, and saying no changes nothing about your spot. Either way you can tell any organizer on the day that you would rather not be photographed, and that holds for the rest of the event. If a photo of you is already up and you would rather it were not, email info@chattersnow.org and we will take it down.$old$
)
update public.site_content as sc
set value = jsonb_set(
      sc.value,
      array[target.paragraph_index],
      to_jsonb($new$Registering for one of our events means you are happy for us to do that there. If you would rather we did not, you do not have to give a reason: tell any organizer on the day and it holds for the rest of the event, or email info@chattersnow.org before or after and we will keep it on the record so that everyone helping run the event knows. If a photo of you is already up and you would rather it were not, email that same address and we will take it down.$new$::text)
    ),
    published_at = now()
from target
where sc.tenant_id = target.tenant_id
  and sc.key = 'events.photo_consent';

-- 2. The privacy policy
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
    -- The sentence itself, so a re-run is a true no-op rather than a rewrite
    -- of identical text with a fresh `published_at`. 20260922090000 relied on
    -- `replace()` alone for this and matched its own output; the other three
    -- writes below match the whole paragraph and already behave.
    and paragraph.value like
      '%We also ask whether you are happy to be photographed or recorded.%'
)
update public.site_content as sc
set value = jsonb_set(
      sc.value,
      array['sections', target.section_index, 'paragraphs', target.paragraph_index],
      to_jsonb(
        replace(
          (sc.value #>> array['sections', target.section_index, 'paragraphs', target.paragraph_index]),
          $old$ We also ask whether you are happy to be photographed or recorded. We keep whichever answer you give — including a no, so that everyone helping run the event knows — with the date and a copy of what you were asked, and you can change your mind at any time from your registration page or by emailing us.$old$,
          $new$ Our event pages say what we do with photos and video, and registering means you are happy for us to do that. If you would rather not be photographed, tell any organizer at the event, email us, or — if you have an account here — say so on your registration page, before or after. We keep that with your registration, with the date and a copy of what you were shown, so that everyone helping run the event knows.$new$
        )
      )
    ),
    published_at = now()
from target
where sc.tenant_id = target.tenant_id
  and sc.key = target.key;

-- 3. The terms of use
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
    and sc.key = 'legal.terms'
    and section.value ->> 'id' = 'photos-and-content'
    and paragraph.value = $old$We take photos and video at events. Where we photograph or record participants for Chatter Snow's own communications, we rely on the consent process described at registration or at the event itself, not on this page — and for anyone under 18, on a parent or guardian's consent.$old$
)
update public.site_content as sc
set value = jsonb_set(
      sc.value,
      array['sections', target.section_index, 'paragraphs', target.paragraph_index],
      to_jsonb($new$We take photos and video at events and use them for Chatter Snow's own communications. Registering for an event means you are happy for us to photograph or record you there. If you would rather we did not, tell any organizer at the event — that holds for the rest of it — or tell us before or after, and we keep it on the record so the people running the event know. For anyone under 18, a parent or guardian can say the same on their behalf.$new$::text)
    ),
    published_at = now()
from target
where sc.tenant_id = target.tenant_id
  and sc.key = target.key;

-- 4. The code of conduct
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
    and sc.key = 'legal.code_of_conduct'
    and section.value ->> 'id' = 'what-we-expect'
    and paragraph.value = $old$Chatter Snow takes photos and video at events for our own newsletters, site, and social accounts. When we do, we go on the consent process described at registration or at the event — see our [terms of use](/terms). You can tell any organizer you'd rather not be photographed, and that holds for the rest of the event.$old$
)
update public.site_content as sc
set value = jsonb_set(
      sc.value,
      array['sections', target.section_index, 'paragraphs', target.paragraph_index],
      to_jsonb($new$Chatter Snow takes photos and video at events for our own newsletters, site, and social accounts. You can tell any organizer you'd rather not be photographed, and that holds for the rest of the event — you do not have to give a reason, and nobody will ask you for one. You can also tell us before or after, and our [terms of use](/terms) set out how to get a photo taken down.$new$::text)
    ),
    published_at = now()
from target
where sc.tenant_id = target.tenant_id
  and sc.key = target.key;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
