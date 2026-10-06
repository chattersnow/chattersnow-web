-- A per-event note in the registration confirmation email.
--
-- The confirmation's wording is the tenant's (auto_reply_templates,
-- 20260918030000), but it is one wording for every event: nothing about a
-- single event could reach the email beyond the detail rows the platform
-- renders. An organizer with something to tell everyone who registers for
-- one event -- a shared discount code, what to bring, where to park -- had
-- to edit the org-wide closing and remember to put it back.
--
-- `events.confirmation_note` is that one paragraph. Null, the default, renders
-- nothing, so every existing event's confirmation is unchanged. It is not in
-- public_events: it goes to the people who registered, not to the listing.
--
-- Plain text, escaped by the renderer like every other tenant sentence. The
-- 1000-character cap is AUTO_REPLY_PARAGRAPH_MAX_LENGTH's, the limit on the
-- paragraphs either side of it; the check is the backstop, the form is the
-- validation.

alter table public.events
  add column confirmation_note text
    constraint events_confirmation_note_length
      check (confirmation_note is null
             or (btrim(confirmation_note) <> '' and char_length(confirmation_note) <= 1000));

comment on column public.events.confirmation_note is
  'A paragraph added to this event''s registration confirmation email, under the event details. Null renders nothing. Not exposed by public_events.';
