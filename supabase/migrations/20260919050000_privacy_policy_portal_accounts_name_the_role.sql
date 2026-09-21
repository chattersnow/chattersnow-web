-- #1296: Chatter Snow's published privacy policy says whose accounts the
-- Portal accounts clock is about.
--
-- The entry reads "For as long as you hold the role", which was a complete
-- description of the accounts this application had until epic #1160 put
-- sign-up on the public site. It is still exactly right for the population it
-- describes -- and that is the change: it now has to say which population,
-- because "Website accounts" is a separate clock with a separate answer, and a
-- reader cannot tell from the old wording which one covers them.
--
-- Only the clause. The period, the promise about disabling access and clearing
-- the portal record, and the sentence about the audit trail are untouched --
-- they are what #602 settled, and nothing here reopens them.
--
-- Chatter Snow does not have the constituent area: `constituent_accounts` is
-- the one module seeded `default_enabled = false` (20260916050000), so no
-- Website accounts bullet is added to this document. If the board turns the
-- area on, this document needs the three constituent clocks added to it, which
-- is the staleness #1292's surface fingerprint is there to report. The
-- platform's own default (src/lib/legal-defaults.ts) publishes them from
-- `RETENTION_POLICIES` for any tenant that has the area on.
--
-- The guard, and what it deliberately declines to do, is 20260909030000's: the
-- update matches only where the bullet list is still exactly the one
-- 20260909020000 seeded and `last_updated` is still the date 20260909030000
-- left. A row the board has edited since is newer than this migration and is
-- left alone. On a database with no `chatter-snow` tenant -- every local and CI
-- database, which bootstraps as `example-nonprofit` -- it is a no-op.
--
-- The section and the paragraph are found by id and by text rather than by
-- fixed index, so a paragraph inserted upstream cannot silently rewrite the
-- wrong one. `last_updated` moves in the same statement, because a published
-- policy whose text changed and whose date did not is the failure the date
-- exists to prevent.
--
-- Triggers off for the same reason as 20260909030000: `set_updated_at` would
-- stamp a null actor and `audit_log_row` would record a change no person made.

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
    and sc.value ->> 'last_updated' = 'September 9, 2026'
    and section.value ->> 'id' = 'how-long-we-keep-it'
    and paragraph.value = $old$- **Contact form messages** — 2 years from the date you sent them.
- **Volunteer applications** — 2 years after your last activity with us, or 1 year if the application is withdrawn or declined.
- **Event registrations** — 3 years after the event.
- **Rider profiles** — Until you ask us to delete your profile, or after 2 years of inactivity.
- **Gear requests** — 3 years after we hand the gear over.
- **Portal accounts** — For as long as you hold the role. When your role ends we permanently disable your access and clear the personal details we hold about you in the portal. We keep the record of what was done through the portal — including which account did it — for governance, security, audit, insurance, and legal reasons.$old$
)
update public.site_content as sc
set value = jsonb_set(
      jsonb_set(
        sc.value,
        array['sections', target.section_index, 'paragraphs', target.paragraph_index],
        to_jsonb($new$- **Contact form messages** — 2 years from the date you sent them.
- **Volunteer applications** — 2 years after your last activity with us, or 1 year if the application is withdrawn or declined.
- **Event registrations** — 3 years after the event.
- **Rider profiles** — Until you ask us to delete your profile, or after 2 years of inactivity.
- **Gear requests** — 3 years after we hand the gear over.
- **Portal accounts** — If you hold a role with us, for as long as you hold it. When your role ends we permanently disable your access and clear the personal details we hold about you in the portal. We keep the record of what was done through the portal — including which account did it — for governance, security, audit, insurance, and legal reasons.$new$::text)
      ),
      '{last_updated}',
      to_jsonb('September 19, 2026'::text)
    ),
    published_at = now()
from target
where sc.tenant_id = target.tenant_id
  and sc.key = target.key;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
