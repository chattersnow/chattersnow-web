-- #1376: photo consent becomes an objection record.
--
-- NOTHING BUT `comment on` STATEMENTS. No DDL, no locks, no type regeneration,
-- no backfill, no row touched anywhere. Every column, type and function named
-- below keeps the definition 20260922070000 gave it; what changes is what the
-- three states mean and what the words around them claim.
--
-- WHAT CHANGED ABOVE THE DATABASE
--
-- #599 shipped photo consent as a question at registration: the organization's
-- own `events.photo_consent` scope above an unticked box, with the three
-- columns recording the answer. The platform owner has reversed that.
-- Registering for an event is itself the agreement to being photographed, and
-- the remedy is removal -- any photo can be taken down on request, at any
-- time. There is no box, and a decline box as an opt-out was declined too.
--
-- It is therefore no longer *consent* in the legal sense: agreement implied by
-- submitting a form is not an unambiguous affirmative act. The honest framing
-- is notice plus a standing right to object, so the word "consent" leaves
-- every surface a human reads while the column names stay. See
-- `docs/legal-basis.md`, "Registering carries the photo agreement".
--
-- THE THREE STATES, FLIPPED
--
--   null   was "nobody was asked"      -> is "no objection on record",
--                                         agreement implied by registering
--   false  was "asked and declined"    -> is "objected -- do not photograph"
--   true   was "asked and granted"     -> is "objection withdrawn, or
--                                         explicitly confirmed"
--
-- NO BACKFILL, AND NONE IS NEEDED. Only `false` has ever had an operational
-- job, and it means exactly the same thing before and after: it is the list
-- somebody checks before pointing a camera. `null` meant "nothing to act on"
-- under both models. So no row is touched, and pre-change rows keep their true
-- meaning -- somebody who ticked a box in September 2026 really did agree, and
-- `photo_consent_text` really is a copy of what they were shown.
--
-- THE NAMES ARE KEPT DELIBERATELY. Renaming these to `photo_objection` would
-- mean dropping and retyping both 150-line registration RPCs (a parameter
-- rename is a signature change), rewriting the column-level `grant select`
-- allow-list, breaking a published API field, regenerating `database.types.ts`
-- and editing every test -- for a name. The comments below are what carry the
-- meaning, and they are cheaper and no less durable.
--
-- WHAT STILL WRITES THESE COLUMNS
--
-- Not the web forms. Both Server Actions now omit `p_photo_consent`, which is
-- declared `default null` on both RPCs, so a registration taken through this
-- platform records three nulls. The RPCs themselves are unchanged and still
-- honour an explicit `p_photo_consent => false` -- that is the published API
-- contract and the only remaining registration-time writer. Nothing writes
-- `true` at registration: a form with no affirmative control cannot produce an
-- affirmative record.
--
-- `set_my_photo_consent()` is the self-service objection route, and it is the
-- narrowest of the three the notice names -- it resolves through
-- `my_constituent_person_id('events')`, so it reaches only somebody who has
-- claimed an account. The other two routes are an organizer at the event and
-- email, and neither passes through this database.

comment on column public.event_registrations.photo_consent is
  'Whether this registrant has objected to being photographed or recorded (#599, #1376). NULL MEANS NO OBJECTION ON RECORD -- agreement is implied by registering, where the organization publishes events.photo_consent paragraphs saying so -- and is the resting state of every registration this platform takes. FALSE MEANS OBJECTED: do not photograph, and it is the one state with an operational job -- it is what an organizer checks before pointing a camera, and it means exactly what it meant under #599, which is why no row was backfilled. True means the objection was withdrawn, or that a public API caller that genuinely asked recorded an explicit confirmation. Nothing may read null as an objection, and nothing writes true at registration. Named photo_consent rather than photo_objection deliberately: see this migration''s header. Cleared by the retention purge with the name and the email, unlike the waiver pair -- an instruction about a face nobody can identify is no more useful than a permission; see 20260922080000 and docs/legal-basis.md.';

comment on column public.event_registrations.photo_consent_at is
  'When the objection above was recorded, or last changed (#599, #1376). Moves whenever set_my_photo_consent() writes, in either direction -- an objection can be withdrawn and made again, unlike waiver_accepted_at, which records an acceptance that happened once and stands. Resolved server-side, never from the client. Null wherever photo_consent is null, which is the ordinary case.';

comment on column public.event_registrations.photo_consent_text is
  'The tenant''s events.photo_consent paragraphs as they stood when this objection was recorded (#599, #1376), joined with blank lines. Written by resolved_photo_consent() from site_content, never from the client -- the same invariant artwork_submissions.consented_terms carries (#1319). A snapshot rather than a version pointer because a content slot has no version table and no permalink, so these words are citable only from the row holding them. Since #1376 it is a copy of what the person was TOLD at the moment they objected, not of a question they were asked: nothing writes it at registration time any more.';

comment on type public.photo_consent_record is
  'What one registration records about photos and video (#599, #1376): whether an objection stands, when it was recorded, and the organization''s own paragraphs as they stood at that moment. All three null means no objection is on record, which is the ordinary state and never an objection.';

comment on function public.resolved_photo_consent(uuid, boolean) is
  'Resolves what a registration should record about photos and video (#599, #1376), reading the tenant''s own events.photo_consent paragraphs so the text is never taken from the client. Returns three nulls where nothing is being recorded -- an omitted answer, or a tenant that publishes no photo notice -- and the value with a timestamp and a snapshot otherwise. Raises nothing. Shared by register_for_event(), register_myself_for_event() and set_my_photo_consent() so no two paths can disagree; since #1376 the first two are reached with an explicit value only by the public API, because neither web form has a control.';

comment on function public.tenant_asks_photo_consent() is
  'Whether the caller''s own tenant currently publishes a photo notice at registration (#599, #1376) -- that is, whether events.photo_consent holds a non-blank paragraph. It no longer means "asks a question": nothing asks, and registering carries the agreement where those paragraphs say so. One bit and never the text, so an events:view reader can tell "there is something to object to here, and this person has not" from "this organization says nothing about photos at all" without holding site_content:view.';

comment on function public.my_photo_consent(uuid) is
  'What the caller''s own registration records about photos and video, or no rows (#599, #1376). `asked` says whether THIS ORGANIZATION PUBLISHES A PHOTO NOTICE RIGHT NOW -- that is, whether there is anything to object to -- and never whether this person was put a question, because since #1376 nobody is. It is computed from the tenant''s events.photo_consent slot alone, with no reference to the row''s own columns, so the objection control appears for every registrant of a tenant that publishes one, including the overwhelming majority whose three columns are null.';

comment on function public.set_my_photo_consent(uuid, boolean) is
  'Records or withdraws the caller''s own objection to being photographed, on one of their registrations (#599, #1376). False records the objection, true withdraws it; a null argument raises PHOTO_CONSENT_REQUIRED, because null is "no objection on record" and letting somebody write it back would erase the record of having objected. Re-stamps photo_consent_at and re-snapshots the organization''s paragraphs as they read now, because that is the text the objection is made against. Raises PHOTO_CONSENT_UNAVAILABLE where the organization publishes no photo notice, rather than clearing the row -- silently nulling an objection would destroy the record an organizer acts on. This is the SELF-SERVICE route and the narrowest of the three: it resolves through my_constituent_person_id(''events''), so it reaches only somebody who has claimed an account. Telling an organizer and emailing are the other two, and neither passes through this database.';
