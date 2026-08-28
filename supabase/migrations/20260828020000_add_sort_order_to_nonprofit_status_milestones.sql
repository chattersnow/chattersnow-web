-- Issue #356: `order by created_at` on nonprofit_status_milestones has no
-- stable result because all 40 seeded rows share one INSERT-statement
-- `created_at` (Postgres evaluates `now()` once per statement, not once per
-- row) — see the migration comment in 20260824210000. Add an explicit
-- sort_order column, following the same pattern as resources.sort_order in
-- 20260822090000 (plain integer, no unique constraint, values spaced by 10
-- so rows can be inserted between existing ones later without renumbering).

alter table public.nonprofit_status_milestones
  add column sort_order integer not null default 0;

update public.nonprofit_status_milestones as m
set sort_order = v.sort_order
from (values
  ('Decide NJ vs NY incorporation', 10),
  ('Confirm legal name availability', 20),
  ('Finalize mission', 30),
  ('Draft Certificate of Incorporation', 40),
  ('Draft bylaws', 50),
  ('Create conflict-of-interest policy', 60),
  ('Establish board/officer roles', 70),
  ('Define fiscal year', 80),
  ('Establish initial budget', 90),
  ('Document existing programs/events', 100),
  ('Evaluate the fiscal-sponsorship bridge strategy: decide whether to pursue a fiscal sponsor to fundraise during the gap before Chatter''s own 501(c)(3) determination, and set the decision point for dropping the sponsor once that determination arrives', 110),

  ('File NJ nonprofit', 120),
  ('Receive corporate formation documents', 130),
  ('Obtain EIN', 140),
  ('Hold organizational board meeting', 150),
  ('Adopt bylaws', 160),
  ('Approve bank account', 170),
  ('Approve IRS application', 180),
  ('Open nonprofit bank account', 190),

  ('Determine 1023 vs 1023-EZ', 200),
  ('Prepare IRS application', 210),
  ('Prepare program descriptions', 220),
  ('Prepare financial projections', 230),
  ('Submit application', 240),
  ('Receive determination', 250),

  ('Complete NJ charitable registration requirements', 260),
  ('Complete applicable NJ tax registrations', 270),
  ('Establish compliant donation processing', 280),
  ('Determine NY foreign-corporation registration requirements', 290),
  ('Register with NY Charities Bureau', 300),
  ('Establish NY annual reporting process', 310),

  ('Website donations', 320),
  ('Donation receipts', 330),
  ('Donor database', 340),
  ('Sponsorships', 350),
  ('Grant applications', 360),
  ('Gear donations', 370),
  ('Event donations', 380),
  ('Financial reporting', 390),
  ('Annual reporting calendar', 400)
) as v(description, sort_order)
where m.description = v.description;
