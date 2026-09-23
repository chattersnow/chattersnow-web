/**
 * What each permission resource actually grants, in the words an administrator
 * granting it would use (#1324).
 *
 * The database catalog (`public.resources`, seeded across the migrations) stays
 * the source of truth for *which* resources exist, their section, their
 * sort order and the one-line `description` printed under a label in the
 * permissions matrix. That line has to fit inside a table cell, so it names the
 * subject area and stops -- it cannot say what changes when a cell moves from
 * None to View to Manage, and it cannot say which adjacent resource covers the
 * thing this one does not. Those are what this module adds.
 *
 * Prose in code rather than a second migration-seeded column, for two reasons:
 * it is reviewed in the pull request that changes the behaviour it describes,
 * and `permission-docs.test.ts` can then hold it to the checks that actually
 * exist on disk. `docs/permissions.md` is the written half of the same rule.
 *
 * Deliberately free of server-only imports: the permissions matrix and the
 * reference page are both client components.
 */

export type PermissionExclusion = {
  /** The adjacent resource that does cover it. */
  key: string;
  /** What that other resource covers, phrased as the thing this one lacks. */
  covers: string;
};

export type PermissionDoc = {
  /**
   * What View allows, in plain task language -- not a restatement of the
   * label.
   *
   * `null` means no check anywhere asks for this resource at View, so granting
   * View behaves exactly like None. That is a real answer an administrator
   * needs, and `permission-docs.test.ts` holds it to the checks on disk in
   * both directions: a documented level must be checked somewhere, and a
   * checked level must be documented.
   */
  view: string | null;
  /** What Manage adds on top of View. `null` has the same meaning as above. */
  manage: string | null;
  /**
   * Adjacent resources whose names are close enough to this one that the split
   * is invisible until somebody is refused. This is the field the ticket was
   * opened over.
   */
  excludes?: readonly PermissionExclusion[];
  /** Anything else to know before granting it: carve-outs, inert grants. */
  notes?: readonly string[];
};

/**
 * Keyed by `resources.key`. Every resource any migration seeds needs an entry
 * here; adding a resource without one fails `bun run test`.
 */
export const PERMISSION_DOCS: Record<string, PermissionDoc> = {
  // ---------------------------------------------------------------- Events
  events: {
    view: "Open the Events section and read an event's details, schedule, sponsors, giveaway, attendance, logistics and volunteer sign-ups, including which registrations said their party includes someone under 18. Also what the Calendar reads to show events alongside calendar items.",
    manage:
      "Create and edit events and everything filed on one: staff and volunteer assignments, shifts, registrants and their messages, discount codes, sponsors, giveaway tiers and logistics. Also the accompanying adult and emergency contact a party with someone under 18 gives — those four are readable at this level and no lower, in the database as well as on screen — and whether public registration asks about under-18s at all, from the Registration button on the Events page.",
    excludes: [
      {
        key: "event_expenses",
        covers: "the money an event spends",
      },
      { key: "event_revenue", covers: "the money an event takes in" },
      {
        key: "event_incidents",
        covers: "incident and problem reports, which are deliberately narrower",
      },
      {
        key: "event_impact",
        covers: "participation, assistance and outcome-survey capture",
      },
      {
        key: "event_volunteer_hours",
        covers: "hours logged against the event",
      },
      {
        key: "artwork_submissions",
        covers: "calls for community artwork and the submissions to them",
      },
    ],
  },
  event_expenses: {
    view: "See an event's expenses on its Expenses tab, and the expense figures the dashboard totals.",
    manage:
      "Record and edit expenses against an event from Finance → Expenses and from the event itself.",
    excludes: [
      {
        key: "finance_approvals",
        covers: "approving, rejecting or marking paid what has been submitted",
      },
      {
        key: "finance",
        covers: "the Finance section's own donation and expense ledgers",
      },
    ],
    notes: [
      "This is the resource an event coordinator needs to book event spend without any access to Finance at large.",
    ],
  },
  event_incidents: {
    view: "Read the incident and problem reports filed against an event.",
    manage: "File, edit and close incident reports on an event.",
    notes: [
      "Split out from Events because the content is sensitive: an incident report can name a participant and describe what happened to them. A coordinator who runs the event does not automatically read these.",
    ],
  },
  event_volunteer_hours: {
    view: "Read the hours logged against an event by anyone.",
    manage: "Log, correct and remove hours against an event for anyone.",
    excludes: [
      {
        key: "volunteer_hours_logging",
        covers: "logging your own hours without touching anyone else's",
      },
      {
        key: "volunteers",
        covers: "the volunteer roster, role types and applications",
      },
    ],
  },
  event_revenue: {
    view: "See an event's revenue on its Revenue tab, and the revenue figures the dashboard totals.",
    manage:
      "Record and edit event revenue -- ticket sales, registration fees, merchandise, onsite donations and grants -- from Finance → Revenue.",
    excludes: [
      {
        key: "sales",
        covers: "the merchandise catalog, the register and the sales ledger",
      },
      { key: "finance", covers: "donations and the expense ledger" },
    ],
  },
  event_impact: {
    view: "Read an event's participation counts, financial-assistance records and outcome-survey responses.",
    manage: "Record and edit that impact data on an event.",
    excludes: [
      {
        key: "programs_reports",
        covers: "the season-wide rollup this data feeds",
      },
    ],
  },
  rider_profiles: {
    view: "See how a person skis or snowboards, their experience level and preferred mountain, wherever the surrounding screen is already open to you: the Rides column and rider block on an event's registrants (which also need Events at Manage), the person record, and the Beginner participants figure on an event's Impact card and the program impact report.",
    manage:
      "Edit those answers — at the door from an event's registrants, and on the person form — and edit the list of mountains the rider profile offers, from the Mountains button on the Events page.",
    excludes: [
      {
        key: "events",
        covers: "the registrants list the door dialog opens from",
      },
      { key: "people", covers: "the rest of a person's record" },
    ],
    notes: [
      "Belongs to the Rider Profile module, which is off unless the platform turns it on for an organization. Without it this row grants nothing at any level, and the rider questions, columns and figures do not appear anywhere.",
      "Seeded from each role's existing access so nothing changed when it arrived: Manage where the role managed Events or People, View where it could see Events, People or Impact tracking.",
      "Deleting a rider profile on request is not gated on this: it stays with People or Events at Manage, so a deletion request can always be honoured.",
    ],
  },
  artwork_submissions: {
    view: "Open the Artwork section: the open calls for community artwork and the submissions that have come in.",
    manage:
      "Create and edit calls, and review, accept, decline and write to submissions.",
    notes: [
      "Its own resource rather than part of Events because the reviewers are usually a comms or programming group rather than whoever runs the event.",
    ],
  },
  programs: {
    view: "Open the Programs section and read the named, repeatable initiatives that events are tagged to.",
    manage: "Create, rename, retire and re-tag programs.",
    excludes: [
      {
        key: "programs_reports",
        covers: "the impact rollup across a program's events",
      },
    ],
  },
  programs_reports: {
    view: "Open Programs → Reports: the season or program rollup of events, participation, assistance, equipment and volunteer hours.",
    manage: null,
    notes: [
      "A reporting resource, so there is nothing to manage. Granting Manage is the same as granting View.",
    ],
  },

  // ------------------------------------------------------------- Inventory
  inventory: {
    view: "Open the Inventory section: the item catalog, categories, requests, donations and distribution records.",
    manage:
      "Edit the item catalog and categories, and record, correct and delete donation intake and distribution movements.",
    excludes: [
      { key: "inventory_reports", covers: "valuation and reporting" },
      {
        key: "inventory_intake",
        covers:
          "recording intake and distribution without the catalog or the reports",
      },
    ],
  },
  inventory_reports: {
    view: "Open Inventory → Reports, and see the inventory valuation figures on the dashboard and on an event.",
    manage: null,
    notes: [
      "A reporting resource, so there is nothing to manage. Granting Manage is the same as granting View.",
    ],
  },
  inventory_intake: {
    view: "Read the inventory category vocabulary, so the intake and distribution pickers have labels in them. Nothing else.",
    manage:
      "Record donation intake and distribution movements, including their photos, from the dashboard's quick actions and from the Inventory → Donations and → Distribution pages -- without any access to the item catalog or the reports.",
    excludes: [
      {
        key: "inventory",
        covers: "the item catalog, categories and requests",
      },
      { key: "inventory_reports", covers: "valuation and reporting" },
    ],
    notes: [
      "A Workflow carve-out: the narrow grant for whoever works the intake table at an event. View alone is not usable -- it only keeps the category labels visible -- so this is a resource to grant at Manage or not at all.",
    ],
  },

  // --------------------------------------------------------------- Finance
  finance: {
    view: "Open the Finance section and see its landing figures. Enough to reach the section, not to read a ledger.",
    manage:
      "Work the donation ledger, the expense ledger and event revenue: record, edit and delete entries, record a donation from the dashboard's quick actions, import a giving provider's CSV export into the donation ledger, and set the giving path the public site points at — which giving page it opens, and the amounts it offers.",
    excludes: [
      {
        key: "finance_approvals",
        covers: "approving, rejecting or marking paid a submitted expense",
      },
      {
        key: "finance_reports",
        covers: "the financial reports and oversight pages",
      },
      { key: "event_expenses", covers: "expenses booked against an event" },
      { key: "event_revenue", covers: "revenue booked against an event" },
      {
        key: "reimbursements",
        covers: "personal-spend reimbursement requests",
      },
      {
        key: "sales",
        covers: "merchandise, the register and the sales ledger",
      },
    ],
    notes: [
      "The name is wider than the grant. Six adjacent resources carve pieces out of it, and this is the split that most often surprises an administrator.",
      "It is also the gate on the giving path (#1389), which is configured in Finance > Donations rather than in Administration because it shapes one feature. Nothing about it moves money: the setting is the address of the page your provider hosts, and your organization is the one being paid.",
    ],
  },
  finance_reports: {
    view: "Open Finance → Reports, and read the financial figures a board member is shown on the dashboard and in a meeting's context pack.",
    manage: null,
    notes: [
      "The board's resource: it reads the reports without reaching a ledger. A reporting resource, so Manage is the same as View.",
    ],
  },
  finance_approvals: {
    view: null,
    manage:
      "Approve, reject or mark paid any submitted expense, and see the approval queue in the attention bell.",
    excludes: [
      { key: "finance", covers: "recording and editing the expenses" },
      {
        key: "reimbursement_approvals",
        covers: "the same decisions on reimbursement requests",
      },
    ],
    notes: [
      "The database refuses an approval by the person who submitted it, whatever this grant says. Self-approve own expenses is the narrow exception.",
    ],
  },
  finance_self_approval: {
    view: null,
    manage:
      "Approve your own routine, below-threshold expense submissions, which Expense approvals alone would refuse.",
    excludes: [
      {
        key: "finance_approvals",
        covers: "approving anybody else's submissions",
      },
    ],
    notes: [
      "A Workflow carve-out, and the narrowest grant in the catalog: it widens nothing except the self-approval rule, and only under the org-wide approval threshold in Organization Settings.",
    ],
  },
  reimbursements: {
    view: "See reimbursement figures in the dashboard and in a meeting's context pack.",
    manage:
      "Open Finance → Reimbursements and submit, edit and withdraw reimbursement requests.",
    excludes: [
      {
        key: "reimbursement_approvals",
        covers: "deciding on a submitted request",
      },
      { key: "finance", covers: "the donation and expense ledgers" },
    ],
    notes: [
      "Reimbursements is a module of its own. A tenant that was not sold it will not see this row at all.",
    ],
  },
  reimbursement_approvals: {
    view: null,
    manage:
      "Approve, reject or mark paid any submitted reimbursement, and see the queue in the attention bell.",
    excludes: [
      { key: "reimbursements", covers: "submitting and editing the requests" },
      {
        key: "finance_approvals",
        covers: "the same decisions on expense submissions",
      },
    ],
    notes: [
      "The database refuses an approval by the person who submitted it. Self-approve own reimbursements is the narrow exception.",
    ],
  },
  reimbursement_self_approval: {
    view: null,
    manage:
      "Approve your own routine, below-threshold reimbursement requests, which Reimbursement approvals alone would refuse.",
    excludes: [
      {
        key: "reimbursement_approvals",
        covers: "approving anybody else's requests",
      },
    ],
    notes: [
      "A Workflow carve-out, the reimbursement twin of Self-approve own expenses, bounded by the same org-wide threshold.",
    ],
  },
  sales: {
    view: "Open Finance → Sales and read the sales ledger, the product catalog and an event's sales figures.",
    manage:
      "Edit the product catalog, take payments on the register, and record, correct and void sales.",
    excludes: [
      { key: "event_revenue", covers: "revenue booked directly on an event" },
      { key: "finance", covers: "donations and the expense ledger" },
    ],
    notes: [
      "Sales belongs to the Finance module, so it disappears from this matrix when Finance is off.",
    ],
  },

  // ---------------------------------------------------------------- People
  people: {
    view: "Open the People directory and its segments, and search people from the command palette.",
    manage:
      "Create, edit, merge and delete people, work the duplicate queue, and manage a person's organization memberships.",
    excludes: [
      {
        key: "people_intake",
        covers: "creating a person inline without the directory",
      },
      { key: "constituent_claims", covers: "the website-account claim queue" },
      {
        key: "volunteers",
        covers: "volunteer roles, applications and participation",
      },
    ],
  },
  people_intake: {
    view: null,
    manage:
      "Create a person inline from an event, donation or intake form, and read back the record you just collided with -- without opening the People directory.",
    excludes: [
      {
        key: "people",
        covers: "the directory itself, editing, merging and deleting",
      },
    ],
    notes: ["A Workflow carve-out for whoever takes names at a table."],
  },
  constituent_claims: {
    view: "See the queue of website accounts asking to be linked to a person in the directory, on People → Claims and on the Users page.",
    manage: "Approve or reject a claim, and link or unlink an account by hand.",
    excludes: [
      { key: "people", covers: "the directory the claim points into" },
      { key: "administration", covers: "portal user accounts and their roles" },
    ],
    notes: [
      "Belongs to the Constituent Accounts module. It is seeded to the Admin role only, on purpose -- widen it once somebody other than an administrator is actually working the queue.",
    ],
  },

  // ------------------------------------------------------------ Volunteers
  volunteers: {
    view: "Open the Volunteers section: role types, applications and participation.",
    manage:
      "Edit volunteer role types, decide on applications, and record participation for anyone.",
    excludes: [
      {
        key: "volunteer_hours_logging",
        covers: "logging your own hours and nobody else's",
      },
      {
        key: "event_volunteer_hours",
        covers: "hours as they are logged against an event",
      },
      {
        key: "volunteer_screening",
        covers:
          "whether somebody has been cleared for a screening level, which is granted separately and deliberately narrower",
      },
      { key: "people", covers: "the underlying contact records" },
    ],
  },
  volunteer_screening: {
    view: "Open Volunteers > Screening levels, and see the screening outcomes recorded against a person on their profile and on a volunteer application.",
    manage:
      "Name the screening levels this organization recognises, and record or remove the outcome of a screening against a person.",
    excludes: [
      {
        key: "volunteers",
        covers:
          "role types, applications and everyone's participation -- none of which this one grants",
      },
      {
        key: "people",
        covers: "the contact record an outcome is filed against",
      },
    ],
    notes: [
      "Seeded to Administrator alone, and deliberately not mirroring Volunteers: a coordinator or a volunteer holds Volunteers at View and has no reason to see who has been screened.",
      "The portal stores the outcome and nothing else -- a level and a date. It has nowhere to put a check, a result, a reference or a note, by design rather than by policy.",
    ],
  },
  volunteer_hours_logging: {
    view: null,
    manage:
      "Log your own hours against an event, from the dashboard's quick actions or the participation page, without being able to edit anyone else's entries.",
    excludes: [
      {
        key: "volunteers",
        covers: "role types, applications and everyone's participation",
      },
      { key: "event_volunteer_hours", covers: "correcting anyone's hours" },
    ],
    notes: ["A Workflow carve-out: the grant a volunteer holds."],
  },

  // ------------------------------------------------------------ Governance
  governance: {
    view: "Read governance records where a page offers them: meeting agendas and the approved minutes, and the governance figures on the dashboard.",
    manage:
      "Open the Governance section and work all of it -- board members, meetings, agendas, minutes, decisions and action items, resolutions, bylaws, policies, conflict-of-interest disclosures, grants, partnerships, annual requirements and nonprofit status.",
    excludes: [
      {
        key: "finance_reports",
        covers: "the financial figures a meeting's context pack pulls in",
      },
    ],
    notes: [
      "The section's own gate asks for Manage, so View is the reader's grant for agendas and approved minutes rather than a way into the section.",
      "Does not reach conduct reports. Administering board records and reading a report that may name a board member are deliberately different grants.",
    ],
  },

  // --------------------------------------------------------------------- Conduct
  //
  // The one resource in the catalog whose two levels are not the same job at
  // two widths. View is a reviewer's ticket and shows nothing on its own; the
  // rows it reaches are decided by assignment, in the database.
  conduct_reports: {
    view: "Open Conduct and read the reports you have been assigned to review or hear an appeal on, and step back from one with a reason. On its own it shows nothing: a person holding View and no assignment sees an empty queue, which is the intended state rather than a fault.",
    manage:
      "Hold intake. Record a report however it arrived, read every report in the organization, assign and unassign reviewers for the review and the appeal, record the acknowledgement, interim and final actions, the decision, the outcome and the appeal, and close or reopen a case.",
    excludes: [
      {
        key: "governance",
        covers:
          "board records, meetings and policies -- including the code of conduct's own text, which is edited in Website",
      },
      {
        key: "event_incidents",
        covers:
          "what went wrong at an event, which is a different record from a report about somebody's behaviour",
      },
      {
        key: "people",
        covers: "the contact records a report may name",
      },
      {
        key: "administration",
        covers:
          "the audit log, which lists changes to conduct records without their narrative -- every line of one is stripped before it is written",
      },
    ],
    notes: [
      "Seeded to Administrator alone, including for Board. Whose job it is to review a report is a decision each organization makes, and a report may name the person it would otherwise be granted to by default.",
      "Assignment is the access grant, so granting View is what makes somebody assignable: the database refuses an assignment to anybody who does not hold it, rather than accepting one that would show them nothing.",
      "Recusal removes the case from the reviewer's view, not just their vote. A recused reviewer keeps neither.",
    ],
  },

  // ------------------------------------------------- Content & Community Calendar
  content_calendar: {
    view: "Open the Calendar and read its items, categories and the events shown beside them.",
    manage:
      "Create and edit calendar items, run recurrence and the importer, manage categories, and work content opportunities.",
    excludes: [
      {
        key: "content_calendar_reports",
        covers: "the annual planning review report",
      },
      { key: "events", covers: "the events the calendar displays" },
    ],
  },
  content_calendar_reports: {
    view: "Run the annual planning review: the year-scoped rollup of Tier 1 decision coverage, on-time completion, overdue work and editorial-guardrail recordkeeping.",
    manage: null,
    notes: [
      "Enforced entirely in the database, inside the annual-review function -- there is no route guard to find in the app code. A reporting resource, so Manage is the same as View.",
    ],
  },

  // -------------------------------------------------------- Communications
  communications: {
    view: "Open the Messages section and read what the public contact form has sent in.",
    manage: "Reply to a message, change its status and assign it.",
    excludes: [
      {
        key: "system_settings",
        covers: "the automatic replies and the sender identity behind them",
      },
    ],
  },

  // -------------------------------------------------------- Administration
  administration: {
    view: "Almost nothing on its own. One database policy admits it; every page filed under Administration asks for Manage.",
    manage:
      "Open Administration: users and their roles, the roles and the permissions matrix itself, the audit log, the email delivery log, data retention, and the organization export. Also gates Technology and some person-record administration.",
    excludes: [
      {
        key: "system_settings",
        covers: "the org-wide settings and automatic replies pages",
      },
      { key: "site_content", covers: "the public website's copy" },
      { key: "platform_tenants", covers: "administering other organizations" },
      {
        key: "access_management_assets",
        covers: "the technology asset registry on its own",
      },
    ],
    notes: [
      "This is the grant that lets somebody change everybody else's access, including their own. Treat it as the most consequential row in the matrix.",
    ],
  },
  system_settings: {
    view: null,
    manage:
      "Edit org-wide configuration -- the expense approval threshold, organization identity, notification settings, automatic replies -- and the Website section's own settings: layout, page visibility and legal documents.",
    excludes: [
      { key: "administration", covers: "users, roles and the audit log" },
      { key: "site_content", covers: "the copy on the public website" },
    ],
    notes: [
      "The board's other grant: it reaches Organization Settings without the Administration permission.",
    ],
  },
  site_content: {
    view: "Open the Website section and read its pages, articles and content packs.",
    manage:
      "Edit the copy on the public website: page headings, introductions, team bios, legal documents and the articles.",
    excludes: [
      {
        key: "system_settings",
        covers: "page layout, page visibility and legal-document settings",
      },
      {
        key: "platform_tenants",
        covers: "the cross-tenant content packs on the same pages",
      },
    ],
  },
  access_management_assets: {
    view: "Open Technology and read the registry of external services, assets and access grants.",
    manage: "Add, edit and retire assets, services and access grants.",
    excludes: [
      {
        key: "access_management_reviews",
        covers: "recording a periodic access review",
      },
    ],
    notes: [
      "A registry of what exists and who has it, not a credential store. Nothing here holds a password.",
    ],
  },
  access_management_reviews: {
    view: "Reach the Technology section to see the review history on an asset.",
    manage:
      "Record a periodic access review on an asset without holding asset-management rights.",
    excludes: [
      {
        key: "access_management_assets",
        covers: "editing the assets themselves",
      },
    ],
  },
  platform_tenants: {
    view: null,
    manage:
      "Open the Platform section and provision and administer the organizations on the platform -- custom domains, module entitlements, exports -- plus the cross-tenant content packs under Website.",
    notes: [
      "Inert outside the platform's own tenant. The grant exists on every tenant's Admin role, and the permission resolver reports it as None unless the reader is a platform operator, so granting it here changes nothing for this organization.",
    ],
  },
};

/** Every resource key this module documents. */
export function documentedResourceKeys(): string[] {
  return Object.keys(PERMISSION_DOCS);
}

export function permissionDocFor(key: string): PermissionDoc | undefined {
  return PERMISSION_DOCS[key];
}

/**
 * The sentence the UI shows for a level with no prose, so "View does nothing
 * here" is stated rather than left as an empty panel.
 */
export const LEVEL_HAS_NO_EFFECT =
  "Nothing on its own — no check in the product asks for this resource at this level, so it behaves like None.";
