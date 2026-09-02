-- Issue #563: nothing in the schema records what kind of rider someone is.
-- Event registration captures name/email/phone/party size and stops, so
-- following up with a registrant -- and eventually grouping them into the
-- right meetup -- has nothing to work from.
--
-- These live on `people` rather than a separate person_rider_profiles table
-- for the same reason is_donor/is_organization/is_attendee do: they're
-- single-valued attributes of the person, and every consumer already reads
-- them off the person row. Splitting them out would buy nothing but a join.
--
-- text + check rather than a Postgres enum, matching the convention used
-- everywhere else in this schema (source_type, condition, support_type, ...).
-- 'both' as a discipline value mirrors event_sponsors.support_type
-- (20260821010000), which solves the same "one, the other, or both" shape.
--
-- All nullable with no backfill: this is answered by the registrant (or by
-- staff), and there's no existing column to derive it from.

alter table public.people
  add column riding_discipline text
    check (riding_discipline in ('ski', 'snowboard', 'both')),
  add column ski_experience_level text
    check (ski_experience_level in ('beginner', 'intermediate', 'advanced')),
  add column snowboard_experience_level text
    check (snowboard_experience_level in ('beginner', 'intermediate', 'advanced')),
  add column preferred_mountain text;

-- An experience level only means something for a discipline the person
-- actually rides, so keep the two in step at the DB level rather than
-- trusting every write path to clear the other one.
alter table public.people
  add constraint people_ski_level_requires_ski
    check (ski_experience_level is null or riding_discipline in ('ski', 'both')),
  add constraint people_snowboard_level_requires_snowboard
    check (snowboard_experience_level is null or riding_discipline in ('snowboard', 'both'));
