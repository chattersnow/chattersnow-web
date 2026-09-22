-- #685: Chatter Snow's own rule for a party that includes someone under 18,
-- and its privacy policy catching up with what the form now asks.
--
-- Two writes, both to this one tenant's rows, both content decisions rather
-- than platform behaviour. The mechanism shipped in 20260922010000 and is
-- identical on every tenant; the words below are Chatter Snow's.
--
-- 1. THE RULE. `events.minor_accompaniment` is blank for every tenant by
--    design -- "a parent or guardian must be present for the whole event" is a
--    policy the platform has no business inventing for an organization it has
--    never met (`docs/legal-basis.md` rule 2). Chatter Snow has one: its code
--    of conduct's "If you're bringing a minor" section, seeded by
--    20260909020000, already says the responsible adult must be at the event
--    for the whole of it and that volunteers are not chaperones. What that
--    section could not say -- because nothing asked -- is whether that adult
--    registers too. Leadership's answer is that they do, and that they count
--    in "Number attending", which is the question #1320 group B says the form
--    could not be built without. The other question in that group, whether
--    there is a minimum age at all, is answered deliberately rather than by
--    omission: there is none. Board ratification of the safeguarding policy as
--    a whole is still open, so this is what is true today, said where somebody
--    is typing. The record is
--    planning/chatter-snow/legal/2026-09-22-minors-and-the-guardian-rule.md.
--
--    It does not link /code-of-conduct. That route 404s until the board adopts
--    the document (#859), and a rule that points at a page nobody can open is
--    worse than one that stands on its own.
--
-- 2. THE POLICY. Chatter Snow serves its own privacy policy, so the platform
--    default's new sentences do not reach it. Its "What we collect, and why"
--    bullet for event registration describes a form that no longer exists.
--    Describing your own form's fields is a factual correction rather than a
--    subprocessor judgement, which is why this ships here in the shape #864
--    used for Resend, instead of waiting in #1320 beside the Sentry item.
--    `last_updated` moves in the same statement: a field added without moving
--    the date is exactly the failure the date exists to prevent.
--
-- Both writes are scoped by slug, like 20260908040000: the demo and platform
-- tenants must not inherit one nonprofit's safeguarding rule, and on a
-- database with no `chatter-snow` tenant (a fresh local or CI database
-- bootstraps as `example-nonprofit`, see docs/tenants.md) both are no-ops --
-- which leaves CI exercising the blank slot and the neutral default, the state
-- every other tenant is in.
--
-- The guards are the established ones. The slot insert is `on conflict do
-- nothing`, because a row somebody has already written from Website > Pages is
-- newer than anything a migration knows. The policy update matches only where
-- the bullet is still exactly the text 20260909020000 seeded and
-- `last_updated` is still 20260919050000's date, so a board edit since then
-- wins over this migration rather than the other way round. A pending *draft*
-- is untouched, with the consequence #864 recorded: publishing a draft written
-- before today drops the sentence again.
--
-- Triggers off for the write, the same reasoning as 20260908050000:
-- `set_updated_at` would stamp the row with a null actor and `audit_log_row`
-- would write an audit entry for a change no person made.
-- `stamp_site_content_authorship` stays on -- it is what moves `published_at`.

alter table public.site_content
  disable trigger set_updated_at,
  disable trigger audit_log_row;

-- 1. The rule
with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.site_content (tenant_id, key, value, published_at)
select tenant.id, v.key, v.value::jsonb, now()
from tenant, (values
  ('events.minor_accompaniment', '["Anyone under 18 is welcome with a parent or legal guardian, and that adult needs to be at the event with them for the whole of it. We are not set up or staffed to supervise anyone, and our volunteers are not chaperones — if the responsible adult leaves, the minor leaves too.","The accompanying adult registers too, so please include them in the number attending. We do not set a minimum age, though the resort and the rental shop apply their own, and an individual program may set its own rules on top of these."]')
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
    and sc.value ->> 'last_updated' = 'September 19, 2026'
    and section.value ->> 'id' = 'what-we-collect'
    and paragraph.value like '%**[Event registration](/events)**%'
)
update public.site_content as sc
set value = jsonb_set(
      jsonb_set(
        sc.value,
        array['sections', target.section_index, 'paragraphs', target.paragraph_index],
        to_jsonb(
          replace(
            (sc.value #>> array['sections', target.section_index, 'paragraphs', target.paragraph_index]),
            $old$To hold your spot, plan the event around who's coming, send you event details, and match the day to the experience levels showing up.$old$,
            $new$To hold your spot, plan the event around who's coming, send you event details, and match the day to the experience levels showing up. We also ask whether anyone in your party is under 18, and if you say yes we ask for the name and mobile number of the adult coming with them and for an emergency contact — we never ask anyone's date of birth or age. Everyone helping run the event can see that your party includes someone under 18; only our board and leads can see those two contacts, and we clear both with the rest of your details on the schedule below.$new$
          )
        )
      ),
      '{last_updated}',
      to_jsonb('September 22, 2026'::text)
    ),
    published_at = now()
from target
where sc.tenant_id = target.tenant_id
  and sc.key = target.key;

alter table public.site_content
  enable trigger set_updated_at,
  enable trigger audit_log_row;
