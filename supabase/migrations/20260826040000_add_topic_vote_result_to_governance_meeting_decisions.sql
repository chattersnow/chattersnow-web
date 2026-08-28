-- Extends governance_meeting_decisions with topic/vote_result (issue #166)
-- so the existing decisions table can directly serve the standard agenda
-- template's "Decisions & Votes" section (Topic/Discussion/Decision/Vote)
-- without duplicating decision data in the agenda's own jsonb. This revises
-- this table's original design note (20260824050000_...) that these were
-- "informal highlights, not formal motions with... vote outcome" -- both
-- columns are nullable, so existing rows and the lighter-weight use case it
-- described still work unchanged. description continues to serve as
-- "Discussion".

alter table public.governance_meeting_decisions
  add column topic text,
  add column vote_result text;
