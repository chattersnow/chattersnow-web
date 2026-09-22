# Conduct reports — specification

Part of [`docs/technical-spec.md`](../technical-spec.md) — section numbers are
unchanged. This file holds §5.24 and the conduct data model. Technology, system
boundaries, security, the route tree and the key workflows stay in the hub. A
plain `§N` below is in this file; a `§N` that lives in another file is always a
link.

**Also relevant:** the `conduct_reports` entitlement is a row in the matrix in
[§5.3](access-control.md#53-authentication-and-authorization); the audit trail
these tables write to is [§5.11](audit.md#511-audit-and-history); the code of
conduct that publishes a reporting address is a tenant's own `site_content` row,
adopted through `legal_publication.code_of_conduct`
([§6, "Multi-tenancy"](multi-tenancy.md#6-data-model--multi-tenancy)).

## 5.24 Conduct reports

**Implemented** (#687). A tenant that adopts a code of conduct publishes a
reporting route and, with it, whatever commitments its own document makes. The
portal is where a report about somebody's behaviour is recorded, reviewed,
acted on, decided and — where the subject appeals — heard again.

The point of the section is evidence rather than tidiness. These are
commitments to people who report harassment or a safety problem, and if the
organization is ever asked whether it handled a report properly — by the person
who reported, by an insurer, by a grantmaker, or in a dispute — the answer has
to be a record rather than a recollection.

### The numbers belong to the tenant, not to the platform

Five days to acknowledge, two reviewers to decide and fourteen days to appeal
are **Chatter Snow's own published document content** since #858, not platform
behaviour. Another organization adopting a code of conduct sets its own numbers
or states none, and a business tenant may have no board at all to do a
two-reviewer review.

So nothing in the schema carries a number. The clocks and the reviewer rule are
four `app_settings` keys under `conduct.`, read through the
`org_conduct_process` view, all four absent by default:

| Key                                          | Means                                                           |
| -------------------------------------------- | --------------------------------------------------------------- |
| `conduct.acknowledgement_days`               | Days to acknowledge a report, counted from `received_on`        |
| `conduct.appeal_days`                        | Days to file an appeal, counted from `decided_on`               |
| `conduct.reviewer_minimum`                   | Unconflicted reviewers a review needs                           |
| `conduct.appeal_excludes_original_reviewers` | Whether an appeal must be heard by people who did not decide it |

**A tenant that has configured nothing gets a case tracker with no deadline
anywhere on it**, and that is the correct rendering rather than a degraded one:
a report shown as three days late against a deadline nobody agreed to is a
failure the software made up. `src/lib/conduct.ts` answers `"unmeasured"` in
every one of those cases, and the queue says in words that no commitment has
been recorded.

They are edited in **Website → Legal documents**, beside the document whose
words they restate. Deliberately not an `org.%` key: `provision_tenant()` copies
every `org.%` row into a new tenant, and a new organization inheriting the first
one's deadlines is the mistake the whole design avoids.

Chatter Snow's four values are written into Chatter Snow's own rows by the
migration. That is transcription of a document it has already drafted, not a
decision taken in code — ratification is #1320 group A, and the process
questions behind it (who holds intake, the outside reviewer for a conflicted
appeal, how long a closed report is kept) are group C.

### Access, which is the part to get right first

A report may name a board member, so the people who administer board records
are precisely the people who must not read one by default. `conduct_reports` is
its own resource in its own module and is **never OR'd with `governance`**.

The two levels do different jobs, which is unusual enough to state plainly:

- **`manage` is the intake role.** It sees every report in the tenant, records
  new ones, assigns reviewers, and writes acknowledgements, actions, outcomes
  and appeals.
- **`view` is a reviewer's ticket, and on its own it shows nothing.** A view
  holder sees only the reports they hold a live, unrecused assignment on.
  Granting it to somebody who is never assigned gives them an empty queue,
  which is the intended and safe outcome.

One function, `can_see_conduct_report(report_id)`, is what every policy on all
four tables defers to, so the rule is written once:

```
has_permission('conduct_reports', 'manage')
or (has_permission('conduct_reports', 'view') and a live assignment names auth.uid())
```

The AND on the reviewer arm guards both directions. Assignment alone would mean
a row in a table quietly widens somebody's access with nothing in the
permissions matrix showing it; the permission alone would mean everyone who can
review anything can read everything. The other end is `check_conduct_reviewer_can_see`,
a trigger that **refuses an assignment to somebody who does not hold the
resource** — because an assignment that shows its subject nothing is worse than
none: the case then waits on a review that cannot start, and nobody involved can
tell from the outside.

Seeded to `admin: manage` and everybody else `none`, including `board`, although
the first tenant's document names the board as the review body. Whose job this
is differs by organization, and a grant that arrives by default is a grant
nobody decided to make. An administrator gives the reviewers `view` from
Administration → Roles, which is one deliberate act with a date and an actor on
it.

**Recusal removes the case, not just the vote.** A reviewer who steps back
because the report names their friend keeps neither, and the same 404 answers
them as answers somebody who was never assigned. It is also the one write a
reviewer can make, through `recuse_from_conduct_report()` rather than an update
policy: the function can only set a recusal, only on the caller's own live row,
and only once, so it can neither un-recuse anybody nor reach another person's
row.

### The audit log must not become the leak

`audit_log` is readable by `administration:manage` — **a different permission
from the one guarding these rows**. Registering these tables the way every other
audited table is registered would have handed the full text of every report,
including the reporter's contact details and the subject's name, to every
administrator through a page that exists to list changes, with the row-level
restriction upstairs still perfect and entirely beside the point.

So every column that can hold a line of narrative is in
`audited_tables.redacted_columns`, which strips it before the snapshot is
written rather than clearing it later on a clock. What survives is the shape of
the change — which case, which action, by whom, when, and the dates, statuses
and severities that moved. A `do` block at the end of the migration refuses to
leave the schema with any text column on these tables unredacted and not on a
short allowlist of codes, so a `notes text` added next season fails the
migration rather than the review.

That is also why a case carries a `reference` (`CR-4QTXM`): an audit entry, an
email or a meeting agenda can name the case without naming anybody in it.

### Retention, deliberately absent

Every other personal-data table in this schema ships with a proposed clock in
`dry_run`. This one does not. A conduct report is the one category where keeping
it too long and deleting it too early are both bad; a period the platform
invented would be a number an administrator could enforce with one switch, and
what it would delete is the evidence the table exists to hold. The period is a
decision, recorded as one in #1320 group C, and the rule lands with it.

### 6. Data model — Conduct reports

- `conduct_reports`: `id`, `tenant_id`, `reference` (unique per tenant,
  generated on insert), `received_on`, `channel`
  (`email`/`in_person`/`event`/`phone`/`post`/`other`), `reporter_kind`
  (`named`/`anonymous`), `reporter_person_id` (composite FK → `people`),
  `reporter_name`, `reporter_contact`, `subject_person_id` (composite FK →
  `people`), `subject_description`, `event_id` (composite FK → `events`),
  `context`, `summary`, `severity` (`minor`/`moderate`/`serious`, the
  vocabulary `event_incidents` already uses), `status`
  (`received`/`acknowledged`/`reviewing`/`decided`/`closed`),
  `acknowledged_on`, `decided_on`, `outcome`, `closed_on`, plus the four
  authorship columns. Constraints carry the guarantees: an anonymous report may
  hold no name, contact or person link; a decision names a date and an outcome
  or neither; closed and a closing date are the same fact in both directions;
  nothing can have happened before the report was received. All three person and
  event references are `on delete set null` — deleting a person must never
  delete a report.
- `conduct_report_reviewers`: `report_id`, `stage` (`review`/`appeal`),
  `user_id` (an **account**, not a `people` row, because what assignment grants
  is read access), `assigned_on`, `assigned_by`, `recused_on`,
  `recusal_reason`, unique on `(tenant_id, report_id, stage, user_id)`. A
  recusal keeps its row: recording one by deleting the assignment would leave a
  case that looks as though the conflicted person was never near it.
- `conduct_report_actions`: `report_id`, `kind` (`interim`/`final`),
  `description`, `taken_on`, `lifted_on`. **`lifted_on is null` is the only
  definition of "in force" in this schema**, which is what makes an interim
  safety measure stand while an appeal is open and after a case is closed.
- `conduct_report_appeals`: `report_id` (unique — one appeal per report),
  `filed_on`, `grounds`, `decided_on`, `outcome`. The row's existence is the
  fact that an appeal was filed; no appeal is an absent row rather than a null.
  A late appeal is recorded and shown as late, never refused: the published
  window is a commitment to hear one filed inside it, not a rule against hearing
  one that arrives after.
- `org_conduct_process`: a security-definer view over the four `conduct.` keys,
  granted to `authenticated` for the same reason `org_timezone` and
  `org_fiscal_year` are — an assigned reviewer holding `conduct_reports:view`
  and nothing else still has to be told what the deadline on the case in front
  of them is.
- RPCs: `can_see_conduct_report(uuid)`, `recuse_from_conduct_report(uuid, text)`,
  `user_can_review_conduct(uuid, uuid)`, `list_conduct_reviewer_candidates()`,
  `list_conduct_actors(uuid[])`.
- No `delete` policy on the report, the actions or the appeal, and no `delete`
  privilege either. A report somebody made is not an entry to tidy away:
  withdrawing one is a status and a closing date, and a case entered in error is
  corrected in place with the audit trail carrying what it said before. The one
  delete that exists removes a reviewer assignment that carries no recusal,
  which is a correction rather than a record.
