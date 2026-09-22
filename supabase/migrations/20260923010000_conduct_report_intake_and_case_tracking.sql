-- Conduct reports: intake, reviewer assignment, interim actions, outcomes and
-- appeals (#687).
--
-- A tenant that adopts a code of conduct publishes a reporting route and, with
-- it, whatever commitments its own document makes: Chatter Snow's says it aims
-- to acknowledge a report within five days, that a review is by at least two
-- board members with conflicted members recused, and that the subject of a
-- report may appeal within fourteen days. Until this migration the portal had
-- nowhere to put any of it. There was no report record, no acknowledgement
-- clock, no reviewer assignment, no recusal, no interim action, no outcome and
-- no appeal: the whole process was an inbox and somebody's memory.
--
-- That is a gap worth closing for one reason above the others. These are
-- commitments to people who report harassment or a safety problem. If the
-- organization is ever asked whether it handled a report properly -- by the
-- person who reported, by an insurer, by a grantmaker, or in a dispute -- the
-- answer has to be evidence rather than recollection.
--
-- ## The numbers are not the platform's
--
-- Five days, two reviewers and fourteen days are the first tenant's OWN
-- PUBLISHED DOCUMENT CONTENT since #858, not platform behaviour, and #687's
-- scope correction says so in as many words. Another organization adopting a
-- code of conduct sets its own numbers or states none; a business tenant may
-- have no board at all to do a two-reviewer review. So nothing below carries a
-- number: the clocks and the reviewer rule are tenant configuration
-- (`conduct.*` in app_settings, section 9), every one of them absent by
-- default, and a tenant that has configured nothing gets a case tracker with no
-- clocks on it rather than somebody else's deadlines.
--
-- Section 10 writes Chatter Snow's four values into Chatter Snow's own rows.
-- That is transcription of a document it has already drafted, not a decision
-- taken here -- ratification of those commitments is #1320 group A, and the
-- process questions behind them (who holds intake, the outside reviewer for a
-- conflicted appeal, how long a closed report is kept) are #1320 group C.
--
-- ## Retention, deliberately absent
--
-- Every other personal-data table in this schema ships with a proposed clock in
-- `dry_run`. This one does not, and that is the ticket's own reasoning rather
-- than an omission: a conduct report is "the one category where keeping it too
-- long and deleting it too early are both bad". A period the platform invented
-- would be a number an administrator could enforce with one switch, and the
-- thing it would delete is the evidence this table exists to hold. The period
-- is a decision, it is recorded as one in #1320 group C, and the rule lands
-- with it.
--
-- What does ship in its place is the narrower protection that is not a
-- judgement call: section 8 keeps every line of narrative out of the audit log
-- entirely, so the trail can say a report was edited without saying what it
-- said.

-- ---------------------------------------------------------------------------
-- 1. The module
-- ---------------------------------------------------------------------------

-- Its own module rather than a corner of `governance`, which is the call
-- docs/permissions.md option 4 describes -- "a whole subject area that did not
-- exist" -- and the same one #1161 made for constituent_accounts.
--
-- The deciding argument is not size, it is who this is for. The governance
-- module is "board meetings, bylaws, policies, resolutions and nonprofit
-- status": a nonprofit's artefacts, and a module a business tenant may never be
-- sold. Handling a report about somebody's behaviour is not a nonprofit
-- activity. Filing it under governance would mean a small business with staff
-- and a code of conduct could not track a harassment report without buying a
-- board-minutes module, which is exactly the assumption CLAUDE.md forbids new
-- platform code from making.
--
-- sort_order 115 puts it between governance (110) and access_management (120).
-- default_enabled true, like everything except constituent_accounts: a tenant
-- that never records a report pays nothing for an empty queue, while a tenant
-- that needs one on a Friday evening must not need a plan change first.
insert into public.modules (key, label, description, sort_order, default_enabled, is_core) values
  ('conduct', 'Conduct',
   'Conduct reports: intake, reviewer assignment with recusal, interim actions, outcomes and appeals.',
   115, true, false);

-- ---------------------------------------------------------------------------
-- 2. The permission
-- ---------------------------------------------------------------------------

-- `conduct_reports` is its own resource and is never OR'd with `governance`.
-- #687 puts this first among the things to get right, and it is right for a
-- blunt reason: a conduct report may name a board member, so the people who
-- administer board records are precisely the people who must not see one by
-- default.
--
-- The two levels do different jobs here, which is unusual enough to state
-- plainly because the row-level policy in section 5 depends on it:
--
--   * `manage` is the INTAKE ROLE. It sees every report in the tenant, records
--     new ones, assigns reviewers, and writes acknowledgements, actions,
--     outcomes and appeals.
--   * `view` is a REVIEWER'S TICKET, and on its own it shows nothing at all. A
--     view holder sees only the reports they have been assigned to and not
--     recused from. Granting it to somebody who is never assigned gives them an
--     empty queue, which is the intended and safe outcome.
--
-- Seeded to `admin: manage` and everyone else `none` -- the conservative
-- default docs/permissions.md asks for -- and NOT to `board`, although the
-- first tenant's document names the board as the review body. Two reasons.
-- Every tenant's review body is different and the platform does not know it;
-- and a grant that arrives by default is a grant nobody decided to make. An
-- administrator gives the reviewers `view` from Administration > Roles, which
-- is one deliberate act with a date and an actor on it, and the assignment UI
-- says so rather than leaving them to guess.
--
-- section 'Conduct' is a section of one today. That is cheaper than filing it
-- under Governance in the permissions matrix, where its whole point is that it
-- is not governance.
insert into public.resources (key, section, label, description, sort_order, module_key) values
  ('conduct_reports', 'Conduct', 'Conduct reports',
   'Reports about behaviour, and the case handling that follows one',
   115, 'conduct');

-- Joined by role name so every tenant's roles are covered and not only the
-- template's -- roles have been per tenant since Phase 2.
insert into public.role_permissions (role_id, resource_id, level)
select r.id, res.id, v.level
from (values
  ('admin', 'conduct_reports', 'manage'),
  -- Explicitly none, and the one worth arguing: `board` holds
  -- governance:manage, and if this resource were seeded to follow it the first
  -- report naming a board member would be readable by the person it named.
  ('board', 'conduct_reports', 'none'),
  ('event_coordinator', 'conduct_reports', 'none'),
  ('finance', 'conduct_reports', 'none'),
  ('volunteer', 'conduct_reports', 'none')
) as v(role_name, resource_key, level)
join public.roles r on r.name = v.role_name
join public.resources res on res.key = v.resource_key;

-- ---------------------------------------------------------------------------
-- 3. The report
-- ---------------------------------------------------------------------------

-- One row per report, whatever channel it arrived on. The portal is the
-- RECORD, not the channel: a report can arrive at the published address, in a
-- corridor at an event, or in a phone call, and all three have to end up in the
-- same place or the queue is a lie about what the organization is holding.
-- That is why there is no public submission form here and no anon grant
-- anywhere in this migration.
--
-- Three shapes in the columns are worth naming before they are read:
--
--   * A REPORTER MAY BE ANONYMOUS, and anonymity is a stored fact rather than
--     an empty field. `reporter_kind` is 'named' or 'anonymous', and the check
--     constraint below refuses a name, a contact or a person link on an
--     anonymous report. Blank-means-anonymous would be indistinguishable from
--     somebody forgetting to type it, and this is the one record where the
--     difference matters to the person who reported.
--
--   * A SUBJECT NEED NOT BE IN THE DIRECTORY. `subject_person_id` points at a
--     `people` row when there is one and `subject_description` carries what the
--     reporter said otherwise -- "a man in a red jacket on the lift". Creating
--     a directory record for somebody because they were complained about would
--     be the wrong instinct made permanent.
--
--   * THE CLOCKS ARE DATES, NOT STATUSES. `acknowledged_on` is what the
--     acknowledgement indicator measures; `decided_on` is what an appeal window
--     runs from. A status column that meant "acknowledged" without saying when
--     could not answer the only question anybody will ask.
create table public.conduct_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  -- A short handle for the case, generated on insert (section 6).
  --
  -- Not decoration. A conduct case is discussed in email and in a meeting
  -- agenda, and naming the subject in either is the disclosure the process is
  -- supposed to prevent. "CR-4QTX" is what a board member writes down.
  reference text not null,
  -- The reviewer's to state, like every other date staff record about
  -- something that happened before they typed it: a report made last Tuesday
  -- and entered today is dated last Tuesday, and every clock counts from then.
  received_on date not null,
  -- How it reached the organization. A platform-level list rather than tenant
  -- vocabulary: these are channels a report physically arrives on, and unlike a
  -- screening tier or a role type there is nothing here for an organization to
  -- name differently.
  channel text not null
    check (channel in ('email', 'in_person', 'event', 'phone', 'post', 'other')),
  reporter_kind text not null check (reporter_kind in ('named', 'anonymous')),
  reporter_person_id uuid,
  -- For a reporter who is not in the directory and should not be added to it
  -- on the strength of having reported something.
  reporter_name text,
  reporter_contact text,
  subject_person_id uuid,
  subject_description text,
  -- The event it happened at, where it was one.
  event_id uuid,
  -- Where it happened when it was not an event: a ride, a workshop, a group
  -- chat, a car park.
  context text,
  -- What was reported, in the words it was reported in. The one column here
  -- that will always hold the most sensitive text in this deployment, and the
  -- reason section 8 redacts the narrative out of the audit log rather than
  -- trusting that everybody who can read the audit log should also be able to
  -- read this.
  summary text not null,
  -- The same three words event_incidents has used since 20260822050000.
  -- Deliberately the same vocabulary: an organization that grades an incident
  -- 'serious' should not have to learn a second scale to grade a report.
  severity text not null default 'moderate'
    check (severity in ('minor', 'moderate', 'serious')),
  status text not null default 'received'
    check (status in ('received', 'acknowledged', 'reviewing', 'decided', 'closed')),
  -- When the organization told the reporter it had the report. What the
  -- acknowledgement indicator measures against the tenant's own published
  -- commitment, where it has one.
  acknowledged_on date,
  -- When the decision was made, and what it was. An appeal window runs from
  -- here.
  decided_on date,
  outcome text,
  closed_on date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  -- Referenced by three child tables, so this table is a composite-key parent
  -- in its own right (20260906080000).
  constraint conduct_reports_tenant_id_id_key unique (tenant_id, id),
  constraint conduct_reports_reference_key unique (tenant_id, reference),
  -- Composite like every other reference between two tenant tables: row-level
  -- security decides which rows a session may see and says nothing about which
  -- rows a column may point at, so a cross-tenant reference has to be refused
  -- by the database itself.
  --
  -- `set null` rather than `cascade` on all three: deleting a person or an
  -- event must never delete a conduct report. The narrative survives with the
  -- link gone, which is the right side of that trade by a wide margin.
  constraint conduct_reports_reporter_in_tenant
    foreign key (tenant_id, reporter_person_id)
    references public.people (tenant_id, id) on delete set null (reporter_person_id),
  constraint conduct_reports_subject_in_tenant
    foreign key (tenant_id, subject_person_id)
    references public.people (tenant_id, id) on delete set null (subject_person_id),
  constraint conduct_reports_event_in_tenant
    foreign key (tenant_id, event_id)
    references public.events (tenant_id, id) on delete set null (event_id),
  -- Anonymity is a promise, so it is a constraint. An anonymous report cannot
  -- carry a name, a contact or a link to a directory record, and no later
  -- ticket can quietly start filling one in.
  constraint conduct_reports_anonymous_names_nobody
    check (
      reporter_kind <> 'anonymous'
      or (reporter_person_id is null and reporter_name is null and reporter_contact is null)
    ),
  -- A decision names both halves or neither. An outcome with no date is
  -- unanswerable when somebody asks when the fourteen days started.
  constraint conduct_reports_decision_is_dated
    check ((decided_on is null) = (outcome is null)),
  constraint conduct_reports_decided_status_has_a_decision
    check (status <> 'decided' or decided_on is not null),
  -- Closed and a closing date are the same fact, in both directions.
  constraint conduct_reports_closed_is_dated
    check ((status = 'closed') = (closed_on is not null)),
  -- Nothing about a report can have happened before the report did.
  constraint conduct_reports_dates_follow_receipt
    check (
      (acknowledged_on is null or acknowledged_on >= received_on)
      and (decided_on is null or decided_on >= received_on)
      and (closed_on is null or closed_on >= received_on)
    )
);

-- The queue's own orders: open cases by age, and everything for one person.
create index conduct_reports_status_idx
  on public.conduct_reports (tenant_id, status, received_on desc);
create index conduct_reports_subject_idx
  on public.conduct_reports (tenant_id, subject_person_id)
  where subject_person_id is not null;
create index conduct_reports_event_idx
  on public.conduct_reports (tenant_id, event_id)
  where event_id is not null;

create trigger set_updated_at before update on public.conduct_reports
  for each row execute function public.set_updated_at();

comment on table public.conduct_reports is
  'One report about behaviour, however it reached the organization (#687). The portal is the record rather than the channel: nothing here is submitted by the public, and every row is entered by somebody holding the intake permission. The acknowledgement and appeal clocks measured against it are tenant configuration (`conduct.*`), because the commitments that set them are a tenant''s own published document rather than platform behaviour.';

comment on column public.conduct_reports.reference is
  'A short handle for the case, so it can be discussed in email or on an agenda without naming the subject (#687). Unique within a tenant, generated on insert.';

comment on column public.conduct_reports.reporter_kind is
  '''anonymous'' is a recorded fact, not an empty name field (#687): a check constraint refuses a name, a contact or a person link alongside it, so a reporter who was promised anonymity cannot be identified later by something somebody typed into the wrong box.';

-- ---------------------------------------------------------------------------
-- 4. Reviewers, recusal, actions and the appeal
-- ---------------------------------------------------------------------------

-- Who reviewed it, and who stepped back from it.
--
-- The whole reason this is a table rather than two columns on the report is
-- RECUSAL. "At least two unconflicted reviewers" is a claim an organization may
-- have to stand behind, and it can only be evidence if both halves are written
-- down: who reviewed, and who was assigned and then stepped back, and why. A
-- recusal that is recorded by deleting the assignment leaves a case that looks
-- as though the conflicted person was never near it.
--
-- `stage` carries the appeal without a second table of the same shape. The
-- first tenant's document promises an appeal "reviewed by board members who
-- were not part of the original decision"; whether that separation is required
-- is tenant configuration (`conduct.appeal_excludes_original_reviewers`),
-- because an organization of four people may have nobody left to ask, and a
-- platform that refused the row would be enforcing one tenant's policy on
-- every other.
--
-- A reviewer is a PORTAL USER, not a `people` row. What assignment grants is
-- read access to a case, which is a thing only an account can hold.
create table public.conduct_report_reviewers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  report_id uuid not null,
  stage text not null check (stage in ('review', 'appeal')),
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_on date not null default current_date,
  assigned_by uuid default auth.uid() references auth.users(id),
  -- Null together or set together (see the check): a recusal without a reason
  -- records that somebody stepped back and loses the only part of it anyone
  -- will ask about.
  recused_on date,
  recusal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Required by set_updated_at(), which writes both columns unconditionally:
  -- a table with the trigger and no updated_by refuses every update with
  -- `record "new" has no field "updated_by"`.
  updated_by uuid references auth.users(id),
  constraint conduct_report_reviewers_report_in_tenant
    foreign key (tenant_id, report_id)
    references public.conduct_reports (tenant_id, id) on delete cascade,
  -- One assignment per person per stage. Being assigned to the review and then
  -- to the appeal is two rows, which is exactly the thing
  -- `conduct.appeal_excludes_original_reviewers` is read against.
  constraint conduct_report_reviewers_one_per_stage
    unique (tenant_id, report_id, stage, user_id),
  constraint conduct_report_reviewers_recusal_is_explained
    check ((recused_on is null) = (recusal_reason is null)),
  constraint conduct_report_reviewers_recusal_follows_assignment
    check (recused_on is null or recused_on >= assigned_on)
);

create index conduct_report_reviewers_report_idx
  on public.conduct_report_reviewers (tenant_id, report_id, stage);
-- The shape the row-level policy asks for on every read of every conduct
-- table: "is this caller a live reviewer on this report".
create index conduct_report_reviewers_user_idx
  on public.conduct_report_reviewers (user_id, report_id)
  where recused_on is null;

create trigger set_updated_at before update on public.conduct_report_reviewers
  for each row execute function public.set_updated_at();

comment on table public.conduct_report_reviewers is
  'Who was assigned to review a conduct report or its appeal, and who recused themselves and why (#687). Assignment is also the access grant: a reviewer sees the case because a live row here names them, and recusing removes the case from their view rather than only removing their vote.';

-- What was done about it, separately from how it ended.
--
-- #687 asks for immediate and interim actions to be held apart from the final
-- outcome, and for the model to reflect that an action can be IN FORCE WHILE AN
-- APPEAL IS OPEN. Both fall out of one shape: an action is a row with a date it
-- was taken and a nullable date it was lifted. Nothing about filing an appeal
-- touches it, which is the point -- "you are not to come to Thursday sessions
-- while we look into this" does not pause because the subject has appealed, and
-- a schema that stored "in force" as a function of the case's status would have
-- made it pause.
create table public.conduct_report_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  report_id uuid not null,
  -- 'interim' is taken while the case is open and can be lifted; 'final' is
  -- part of the outcome. Both live here rather than one of them living in
  -- `conduct_reports.outcome`, because a final action also has a date it
  -- started and may have a date it ended, and prose in an outcome column
  -- cannot be asked "is this still in force".
  kind text not null check (kind in ('interim', 'final')),
  description text not null,
  taken_on date not null,
  -- Null means still in force. Nothing infers this from the case's status.
  lifted_on date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint conduct_report_actions_report_in_tenant
    foreign key (tenant_id, report_id)
    references public.conduct_reports (tenant_id, id) on delete cascade,
  constraint conduct_report_actions_lifted_after_taken
    check (lifted_on is null or lifted_on >= taken_on)
);

create index conduct_report_actions_report_idx
  on public.conduct_report_actions (tenant_id, report_id, taken_on desc);

create trigger set_updated_at before update on public.conduct_report_actions
  for each row execute function public.set_updated_at();

comment on table public.conduct_report_actions is
  'Something the organization did about a report -- interim or final -- with the date it was taken and, once it ends, the date it was lifted (#687). `lifted_on is null` is the only definition of "in force" in this schema, so an interim safety action stands while an appeal is open rather than lapsing with a status change.';

-- The appeal.
--
-- Its own table rather than three more columns on the report, for the reason
-- person_screenings gives for having no status column: the ROW'S EXISTENCE is
-- the fact. "No appeal was filed" and "an appeal was filed and we have not
-- recorded its outcome" are different answers, and nullable columns on the
-- parent would have rendered them identically.
--
-- One per report. A second appeal of the same decision is not a thing any
-- published commitment here describes, and a unique constraint is easier to
-- relax later than a duplicate is to explain.
create table public.conduct_report_appeals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) default public.default_tenant_id(),
  report_id uuid not null,
  filed_on date not null,
  -- What the appeal says. Held apart from the report's own narrative because
  -- it is the subject's account rather than the reporter's, and the two must
  -- never be read as one document.
  grounds text,
  decided_on date,
  outcome text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint conduct_report_appeals_report_in_tenant
    foreign key (tenant_id, report_id)
    references public.conduct_reports (tenant_id, id) on delete cascade,
  constraint conduct_report_appeals_one_per_report
    unique (tenant_id, report_id),
  constraint conduct_report_appeals_decision_is_dated
    check ((decided_on is null) = (outcome is null)),
  constraint conduct_report_appeals_decided_after_filing
    check (decided_on is null or decided_on >= filed_on)
);

create trigger set_updated_at before update on public.conduct_report_appeals
  for each row execute function public.set_updated_at();

comment on table public.conduct_report_appeals is
  'An appeal against the decision on a conduct report (#687). The row''s existence is the fact that one was filed; no appeal is an absent row rather than a null. Whether it was filed inside the tenant''s published window is computed from `filed_on` and `conduct_reports.decided_on`, and a late appeal is recorded and shown as late rather than refused -- the window is the organization''s commitment to hear one, not a rule against hearing a late one.';

-- ---------------------------------------------------------------------------
-- 5. Who can see a case
-- ---------------------------------------------------------------------------

-- The single answer every policy in this migration defers to, so that "who can
-- read a conduct report" is written once and cannot drift between the four
-- tables that hold one case.
--
-- security definer for the usual reason a permission helper is: it reads
-- conduct_report_reviewers, which is itself gated on this function, and an
-- invoker-rights version would recurse through its own policy.
--
-- Note the AND rather than an OR on the reviewer arm. A live assignment is not
-- on its own enough -- the assignee must also hold `conduct_reports` at view --
-- and the two halves guard different failures. Assignment alone would mean a
-- row in a table quietly widens somebody's access with nothing in the
-- permissions matrix showing it; the permission alone would mean everyone who
-- can review anything can read everything. Section 7 keeps the pair honest from
-- the other end, by refusing an assignment to somebody who does not hold the
-- permission, so an assignment never silently shows its subject nothing.
create function public.can_see_conduct_report(p_report_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_permission('conduct_reports', 'manage')
    or (
      public.has_permission('conduct_reports', 'view')
      and exists (
        select 1
        from public.conduct_report_reviewers r
        where r.report_id = p_report_id
          and r.user_id = auth.uid()
          -- Recusal removes the case, not just the vote (#687). A reviewer who
          -- steps back because the report names their friend should not keep
          -- reading it.
          and r.recused_on is null
      )
    );
$$;

comment on function public.can_see_conduct_report(uuid) is
  'Whether the caller may read one conduct report: the intake permission sees every report in the tenant, and a `conduct_reports:view` holder sees only reports they hold a live, unrecused assignment on (#687). Every policy on the four conduct tables defers to this so the rule is written once.';

grant execute on function public.can_see_conduct_report(uuid) to authenticated;

alter table public.conduct_reports enable row level security;
alter table public.conduct_report_reviewers enable row level security;
alter table public.conduct_report_actions enable row level security;
alter table public.conduct_report_appeals enable row level security;

create policy "conduct_reports select" on public.conduct_reports
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.can_see_conduct_report(id)
  );
-- Writes are the intake role's, on all four tables. A reviewer reads the case
-- and recuses themselves (section 6); they do not edit the record of what was
-- reported. The one thing a reviewer can write is their own recusal, and it
-- goes through a function rather than a policy so that "update your own row"
-- cannot also mean "un-recuse yourself" or "assign yourself to another case".
create policy "conduct_reports insert" on public.conduct_reports
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  );
create policy "conduct_reports update" on public.conduct_reports
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  );
-- No delete policy, and that is the decision rather than an oversight. A report
-- somebody made is not an entry to tidy away: withdrawing one is a status and a
-- closing date, and a case entered in error is corrected in place with the
-- audit trail carrying what it said before. Nothing in the product offers a
-- delete, and with no policy the database refuses one even if something later
-- tries.

create policy "conduct_report_reviewers select" on public.conduct_report_reviewers
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.can_see_conduct_report(report_id)
  );
create policy "conduct_report_reviewers insert" on public.conduct_report_reviewers
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  );
create policy "conduct_report_reviewers update" on public.conduct_report_reviewers
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  );
-- Unassigning somebody who was never meant to be on the case is a correction,
-- not a recusal, and intake can make it. Recusal is the other thing and it is
-- never a delete: it keeps the row.
create policy "conduct_report_reviewers delete" on public.conduct_report_reviewers
  for delete to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
    and recused_on is null
  );

create policy "conduct_report_actions select" on public.conduct_report_actions
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.can_see_conduct_report(report_id)
  );
create policy "conduct_report_actions insert" on public.conduct_report_actions
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  );
create policy "conduct_report_actions update" on public.conduct_report_actions
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  );

create policy "conduct_report_appeals select" on public.conduct_report_appeals
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.can_see_conduct_report(report_id)
  );
create policy "conduct_report_appeals insert" on public.conduct_report_appeals
  for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  );
create policy "conduct_report_appeals update" on public.conduct_report_appeals
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and public.has_permission('conduct_reports', 'manage')
  );

-- No `delete` in any of these grants except the reviewer correction above: a
-- table with no delete policy still refuses one, and withholding the privilege
-- as well says the same thing twice on purpose.
grant select, insert, update on public.conduct_reports to authenticated;
grant select, insert, update, delete on public.conduct_report_reviewers to authenticated;
grant select, insert, update on public.conduct_report_actions to authenticated;
grant select, insert, update on public.conduct_report_appeals to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The reference, and recusing yourself
-- ---------------------------------------------------------------------------

-- Confusable characters (0/O, 1/I/L) are excluded, the same alphabet
-- generate_volunteer_reference_code() uses and for the same reason: a code read
-- aloud in a meeting or copied out of an email must not silently resolve to a
-- different case.
--
-- Unique within a tenant rather than globally, because it is shown to that
-- tenant's staff and nobody else, and a collision across two organizations that
-- cannot see each other's rows is not a collision.
create function public.generate_conduct_report_reference(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    select 'CR-' || string_agg(substr(v_chars, (ceil(random() * length(v_chars)))::int, 1), '')
    into v_code
    from generate_series(1, 5);

    exit when not exists (
      select 1 from public.conduct_reports
      where tenant_id = p_tenant_id and reference = v_code
    );
  end loop;
  return v_code;
end;
$$;

-- A trigger rather than a column default: the default would have to know the
-- row's tenant, and a default expression cannot see the rest of the row.
create function public.set_conduct_report_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := public.generate_conduct_report_reference(new.tenant_id);
  end if;
  return new;
end;
$$;

create trigger set_conduct_report_reference
  before insert on public.conduct_reports
  for each row execute function public.set_conduct_report_reference();

-- Recusing yourself is the one write a reviewer can make, and it has to be
-- theirs rather than the intake holder's: a conflict is something only the
-- reviewer knows about, and a process that makes them ask an administrator to
-- record it at eleven at night is a process that will instead record nothing.
--
-- A function rather than a row-level update policy, because "may update their
-- own assignment" is a much wider grant than the one thing intended. This can
-- only set a recusal, only on the caller's own live row, and only once --
-- `recused_on is null` in the WHERE is what stops somebody quietly un-recusing
-- themselves back onto a case they stepped away from.
create function public.recuse_from_conduct_report(
  p_report_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_rows integer;
begin
  if v_reason is null then
    raise exception 'REASON_REQUIRED';
  end if;

  update public.conduct_report_reviewers
     set recused_on = current_date,
         recusal_reason = v_reason
   where report_id = p_report_id
     and user_id = auth.uid()
     and tenant_id = (select public.current_tenant_id())
     and recused_on is null;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'NOT_ASSIGNED';
  end if;
end;
$$;

comment on function public.recuse_from_conduct_report(uuid, text) is
  'Records that the caller has stepped back from a conduct report, with their reason (#687). The only write a reviewer can make: it sets a recusal on the caller''s own live assignment and nothing else, so it can neither un-recuse anybody nor reach another person''s row. Recusing removes the case from the caller''s view, which is deliberate -- a conflicted reviewer keeps neither the vote nor the reading.';

revoke execute on function public.recuse_from_conduct_report(uuid, text) from public;
grant execute on function public.recuse_from_conduct_report(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Assigning somebody who can actually see it
-- ---------------------------------------------------------------------------

-- The failure this closes: intake assigns a board member, the toast says it
-- worked, and the board member opens the portal to find nothing there, because
-- their role does not carry `conduct_reports`. Nobody involved has any way to
-- tell that from the outside, and the case sits waiting on a review that cannot
-- start.
--
-- So the database refuses the assignment instead, and the message says what to
-- do about it. The permission and the assignment are the two halves of
-- can_see_conduct_report(); this is what keeps them from being set separately
-- by two people who each assume the other did it.
create function public.user_can_review_conduct(p_user_id uuid, p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(max(public.permission_rank(rp.level)), 0) >= public.permission_rank('view')
    and public.module_enabled_for_tenant(p_tenant_id, 'conduct') is not false
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  join public.resources res on res.id = rp.resource_id
  where ur.user_id = p_user_id
    and ur.tenant_id = p_tenant_id
    and res.key = 'conduct_reports'
    and not exists (
      select 1 from public.deactivated_users du where du.user_id = p_user_id
    );
$$;

comment on function public.user_can_review_conduct(uuid, uuid) is
  'Whether a named user holds `conduct_reports` at view or above in a named tenant (#687). A narrow, single-purpose companion to has_permission(), which only ever answers for the caller: assignment has to ask about somebody else.';

create function public.check_conduct_reviewer_can_see()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.user_can_review_conduct(new.user_id, new.tenant_id) then
    raise exception 'REVIEWER_CANNOT_SEE_CONDUCT_REPORTS'
      using hint = 'Grant this person Conduct reports at View in Administration > Roles before assigning them.';
  end if;
  return new;
end;
$$;

create trigger check_conduct_reviewer_can_see
  before insert or update of user_id on public.conduct_report_reviewers
  for each row execute function public.check_conduct_reviewer_can_see();

-- Who intake may assign. Narrow in both directions, the same shape
-- list_site_content_actors() has: gated on the caller's own permission, and
-- scoped to the caller's tenant, so it can neither be called by somebody
-- outside the process nor used to enumerate accounts.
create function public.list_conduct_reviewer_candidates()
returns table (user_id uuid, email text, full_name text)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
  join public.user_roles ur on ur.user_id = u.id
  where public.has_permission('conduct_reports', 'manage')
    and ur.tenant_id = (select public.current_tenant_id())
    and public.user_can_review_conduct(u.id, ur.tenant_id)
  group by u.id, u.email, u.raw_user_meta_data
  order by 3 nulls last, 2;
$$;

comment on function public.list_conduct_reviewer_candidates() is
  'The people in the caller''s tenant who hold `conduct_reports` at view or above, and can therefore be assigned to a report and actually read it (#687). Empty for a caller without the intake permission.';

revoke execute on function public.list_conduct_reviewer_candidates() from public;
grant execute on function public.list_conduct_reviewer_candidates() to authenticated;

-- Names for the ids already on a case the caller can read: reviewers,
-- assigners, and whoever recorded what. A reviewer holding `view` needs these
-- as much as intake does -- a case whose other reviewer is a uuid is a case you
-- cannot tell you are conflicted on -- so the gate here is `view`, narrowed by
-- the ids having to appear on this tenant's own conduct rows.
create function public.list_conduct_actors(p_user_ids uuid[])
returns table (user_id uuid, email text, full_name text)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
  where public.has_permission('conduct_reports', 'view')
    and u.id = any(p_user_ids)
    and (
      exists (
        select 1 from public.conduct_report_reviewers r
        where r.tenant_id = (select public.current_tenant_id())
          and u.id in (r.user_id, r.assigned_by)
          and public.can_see_conduct_report(r.report_id)
      )
      or exists (
        select 1 from public.conduct_reports c
        where c.tenant_id = (select public.current_tenant_id())
          and u.id in (c.created_by, c.updated_by)
          and public.can_see_conduct_report(c.id)
      )
    );
$$;

revoke execute on function public.list_conduct_actors(uuid[]) from public;
grant execute on function public.list_conduct_actors(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Audit, and the narrative that must not reach it
-- ---------------------------------------------------------------------------

-- "The audit trail is much of the point" (#687): a case tracker whose history
-- can be edited without trace answers none of the questions it exists to
-- answer. All four tables are registered and triggered.
--
-- And then the part that is specific to this table and is the reason #687 asks
-- for it to be confirmed rather than assumed. `audit_log` is readable by
-- `administration:manage` and by nothing else -- which is a DIFFERENT PERMISSION
-- from the one guarding these rows. Registering these tables the way every
-- other audited table is registered would therefore have handed the full text
-- of every conduct report, including the reporter's contact details and the
-- subject's name, to every administrator, through a page that exists to list
-- changes. The row-level restriction upstairs would still be perfect and
-- entirely beside the point.
--
-- So every column that can hold a line of narrative is in `redacted_columns`,
-- which strips it before the snapshot is written (20260905160000) rather than
-- clearing it later on a clock. What survives in the trail is the shape of the
-- change -- which report, which action, by whom, when, and the dates, statuses
-- and severities that moved -- which is what an audit of the process needs and
-- is not the same thing as the contents of the report.
--
-- This is also why section 3's `reference` exists: the audit entry names the
-- case in a way an administrator can quote back without it naming a person.
--
-- Redacting at write time has the side effect of satisfying
-- retention_unregistered_personal_columns() for free: a redacted column never
-- reaches a snapshot, so there is nothing for the seven-year clock to clear.
insert into public.audited_tables (table_name, pk_column, redacted_columns) values
  ('conduct_reports', 'id',
   '{summary,outcome,context,subject_description,reporter_name,reporter_contact}'),
  ('conduct_report_reviewers', 'id', '{recusal_reason}'),
  ('conduct_report_actions', 'id', '{description}'),
  ('conduct_report_appeals', 'id', '{grounds,outcome}');

create trigger audit_log_row after insert or update or delete
  on public.conduct_reports
  for each row execute function public.audit_log_row();

create trigger audit_log_row after insert or update or delete
  on public.conduct_report_reviewers
  for each row execute function public.audit_log_row();

create trigger audit_log_row after insert or update or delete
  on public.conduct_report_actions
  for each row execute function public.audit_log_row();

create trigger audit_log_row after insert or update or delete
  on public.conduct_report_appeals
  for each row execute function public.audit_log_row();

-- ---------------------------------------------------------------------------
-- 9. The tenant's own process, as configuration
-- ---------------------------------------------------------------------------

-- Four `app_settings` keys, and the important thing about all four is that
-- THEIR DEFAULT IS ABSENCE. A tenant that has configured nothing gets a case
-- tracker with no deadline anywhere on it: no acknowledgement indicator, no
-- appeal window, no reviewer count to fall short of. That is the only honest
-- default, because a clock the platform invented would be a commitment made on
-- an organization's behalf (docs/legal-basis.md rule 2), and a report handled
-- three days late against a deadline nobody agreed to is a failure the software
-- made up.
--
--   conduct.acknowledgement_days   integer: days to acknowledge a report
--   conduct.appeal_days            integer: days the subject has to appeal
--   conduct.reviewer_minimum       integer: unconflicted reviewers a review needs
--   conduct.appeal_excludes_original_reviewers
--                                  boolean: whether an appeal must be heard by
--                                  people who were not part of the decision
--
-- Not an `org.%` key on purpose: provision_tenant() copies every `org.%` row
-- into a new tenant (20260906110000), and a new organization inheriting the
-- first one's deadlines is precisely the mistake this whole design is avoiding.
--
-- They are edited in Website > Legal documents, beside the Code of Conduct,
-- because what they restate is that document's own published words. Keeping the
-- promise and the number that measures it on one screen is what stops the two
-- drifting, which they will do the first time somebody edits the text alone.
create view public.org_conduct_process
with (security_barrier = true) as
select
  -- `min` over a one-row-per-key table is just "the value", and reads without
  -- a subquery per column. Anything that is not a POSITIVE whole number
  -- resolves to null rather than raising: an unreadable setting has to mean
  -- "no clock", never "the page will not render".
  --
  -- That is also how a setting is CLEARED. `app_settings.value` is `not null`
  -- and `authenticated` holds no delete on the table -- both deliberate, and
  -- neither worth widening for this -- so "we commit to nothing here" is
  -- stored as `0` and read as null from here up. Keeping the row rather than
  -- removing it also keeps the audit entry for somebody having cleared it,
  -- which is the same call `updateGiveawayRulesAnswerAction` makes when it
  -- stores an empty array instead of deleting.
  min(case when key = 'conduct.acknowledgement_days'
                and (value #>> '{}') ~ '^[1-9][0-9]*$'
           then (value #>> '{}')::int end) as acknowledgement_days,
  min(case when key = 'conduct.appeal_days'
                and (value #>> '{}') ~ '^[1-9][0-9]*$'
           then (value #>> '{}')::int end) as appeal_days,
  min(case when key = 'conduct.reviewer_minimum'
                and (value #>> '{}') ~ '^[1-9][0-9]*$'
           then (value #>> '{}')::int end) as reviewer_minimum,
  coalesce(bool_or(case when key = 'conduct.appeal_excludes_original_reviewers'
                        then value = to_jsonb(true) end), false)
    as appeal_excludes_original_reviewers
from public.app_settings
where tenant_id = (select public.current_tenant_id())
  and key like 'conduct.%';

comment on view public.org_conduct_process is
  'The current tenant''s own conduct-process commitments, as numbers the portal can measure against (#687): the acknowledgement clock, the appeal window, the reviewers a review needs, and whether an appeal must be heard by people who were not part of the decision. Every one of them is null or false until that organization sets it, because they restate a tenant''s published document rather than anything the platform promises. Security definer by design (#887): the audience is anyone who can open a conduct case, not only the `manage` holders app_settings'' select policy admits -- the same reasoning as org_fiscal_year and org_timezone. Isolation is tenant_id = current_tenant_id().';

grant select on public.org_conduct_process to authenticated;
revoke insert, update, delete on public.org_conduct_process from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 10. Chatter Snow's own four numbers
-- ---------------------------------------------------------------------------

-- Transcription, not a decision. Chatter Snow's code of conduct -- its own
-- `site_content` row since 20260909020000 -- already says it aims to
-- acknowledge a report within five days, that a review is by at least two board
-- members with conflicted members recused when practicable, and that the
-- subject may appeal within fourteen days to board members who were not part of
-- the original decision. Those four numbers are written here so the portal
-- measures against the tenant's own published words rather than against
-- nothing.
--
-- Recording them changes no commitment and makes none: `/code-of-conduct` 404s
-- on that tenant today because no `legal_publication.code_of_conduct` row
-- exists, and ratification of these commitments is #1320 group A. The rest of
-- that conversation -- who holds intake, the named outside reviewer for an
-- appeal nobody unconflicted can hear, and how long a closed report is kept --
-- is group C, and none of it is a code dependency of anything here.
--
-- Scoped by slug rather than by default_tenant_id(), like
-- 20260921080000 and 20260908040000: the demo and platform tenants must not
-- inherit one organization's deadlines, and on an environment with no
-- `chatter-snow` tenant the CTE matches nothing and this is a no-op.
-- `on conflict do nothing`, because a value an administrator has already set is
-- newer than anything a migration knows.

-- Triggers off for the write, the same reasoning as the identity seed:
-- set_updated_at would stamp the row with a null actor, and audit_log_row would
-- record a change no person made.
alter table public.app_settings
  disable trigger set_updated_at,
  disable trigger audit_log_row;

with tenant as (
  select id from public.tenants where slug = 'chatter-snow'
)
insert into public.app_settings (tenant_id, key, value)
select tenant.id, v.key, v.value::jsonb
from tenant, (values
  ('conduct.acknowledgement_days', '5'),
  ('conduct.appeal_days', '14'),
  ('conduct.reviewer_minimum', '2'),
  ('conduct.appeal_excludes_original_reviewers', 'true')
) as v(key, value)
on conflict (tenant_id, key) do nothing;

alter table public.app_settings
  enable trigger set_updated_at,
  enable trigger audit_log_row;

-- ---------------------------------------------------------------------------
-- 11. Self-check
-- ---------------------------------------------------------------------------

-- The guarantee in section 8 is the one most likely to be lost by a later
-- migration adding a column: a `notes text` on conduct_reports next season
-- would reach the audit log in full, read by a permission that does not admit
-- the row itself, and nothing would say so. This refuses to leave the schema in
-- that state.
--
-- The allowlist is every text column on these tables that is a code rather than
-- prose -- a status, a channel, a severity, a stage, a kind, a case reference.
-- Anything else has to be redacted, or named here with a reason.
do $$
declare
  v_columns text;
begin
  select string_agg(format('%s.%s', i.table_name, i.column_name), ', ' order by 1)
    into v_columns
  from information_schema.columns i
  join public.audited_tables a on a.table_name = i.table_name
  where i.table_schema = 'public'
    and i.table_name in (
      'conduct_reports', 'conduct_report_reviewers',
      'conduct_report_actions', 'conduct_report_appeals'
    )
    and i.data_type = 'text'
    and i.column_name not in (
      'reference', 'channel', 'reporter_kind', 'severity', 'status', 'stage', 'kind'
    )
    and not (i.column_name = any(a.redacted_columns));

  if v_columns is not null then
    raise exception 'conduct narrative reaching the audit log unredacted (%); add the column to audited_tables.redacted_columns', v_columns;
  end if;
end $$;

-- And the other half of section 5: a delete grant on the report itself would
-- undo the "no delete policy" decision by the shortest possible route, since a
-- table with a privilege and no policy still refuses the write today but stops
-- refusing it the moment somebody adds a permissive policy for another reason.
do $$
declare
  v_privileges text;
begin
  select string_agg(distinct privilege_type, ', ') into v_privileges
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name in ('conduct_reports', 'conduct_report_actions', 'conduct_report_appeals')
    and grantee = 'authenticated'
    and privilege_type = 'DELETE';
  if v_privileges is not null then
    raise exception 'a conduct table is deletable by authenticated; a report is closed or corrected, never removed';
  end if;
end $$;
