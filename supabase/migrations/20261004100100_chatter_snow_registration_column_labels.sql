-- #1512: Chatter Snow's short column labels for its carpool questions.
--
-- Tenant: chatter-snow. Its 5Borough event asks five registration questions,
-- set up in the editor rather than seeded, so they are matched here by what
-- they say:
--
--   the carpool choice (the parent both seat questions are conditional on)
--                                                     -> "Carpool"
--   "Which borough/city are you coming from/leaving from?" -> "Borough"
--   "How many seats do you need?" / "How many open seats ..." -> "seats",
--     the unit those follow-ups fold into the Carpool cell with
--     ("Needs ride · 1 seat")
--   "Ok to share my name, phone, email and borough/city with 5Borough"
--                                                     -> "Shares info"
--
-- Scoped by `tenants.slug = 'chatter-snow'`, so on a database with no such
-- tenant -- local and CI, which bootstrap as `example-nonprofit` -- this is a
-- clean no-op. Only a label nobody has set yet is written, so one staff typed
-- in the editor first wins. A question it does not match keeps falling back
-- to its prompt, which is the state every other tenant is in.
--
-- The audit trigger is off for the write, as 20260923110000 does for its
-- seed: it would record a change no person made.

alter table public.event_registration_questions
  disable trigger audit_log_row;

with cs as (
  select id from public.tenants where slug = 'chatter-snow'
),
current_questions as (
  select q.*
    from public.event_registration_questions q
    join cs on cs.id = q.tenant_id
   where q.archived_at is null
     and q.column_label is null
),
seats as (
  select id, show_if
    from current_questions
   where kind = 'number'
     and show_if is not null
     and prompt ilike 'how many%seats%'
),
labels (id, label) as (
  select (s.show_if->>'question_id')::uuid, 'Carpool' from seats s
  union
  select id, 'seats' from seats
  union
  select id, 'Borough' from current_questions
   where prompt ilike 'which borou%'
  union
  select id, 'Shares info' from current_questions
   where kind = 'consent' and prompt ilike 'ok to share%'
)
update public.event_registration_questions q
   set column_label = l.label
  from labels l
 where q.id = l.id
   and q.column_label is null
   and q.tenant_id in (select id from cs);

alter table public.event_registration_questions
  enable trigger audit_log_row;
