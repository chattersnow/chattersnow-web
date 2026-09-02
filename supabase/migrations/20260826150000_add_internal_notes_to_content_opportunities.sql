-- General internal working-notes field for a content brief (issue #113
-- scope item 4). Policy-level guardrail only -- the column comment and the
-- portal's field description carry the warning; this is deliberately not
-- automated PII/PHI detection (see the issue's own scope text and epic
-- #102's non-goal "storing sensitive personal information in calendar
-- records").

alter table public.content_opportunities add column internal_notes text;

comment on column public.content_opportunities.internal_notes is
  'General internal working notes for staff. Policy guardrail (issue #113): never record specific personal, medical, legal, or confidential case details here -- this is ordinary internal workflow text, not a private case file, and is visible to any content-calendar manager. Not automatically scanned.';
