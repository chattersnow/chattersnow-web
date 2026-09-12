import {
  hasAnyPermission,
  type PermissionCheck,
  type PermissionMap,
} from "@/lib/auth/permissions";
import { applyLexicon, type Lexicon } from "@/lib/lexicon";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PersonType, RoleKey } from "./people-shared";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export type SegmentStat = {
  /** A `{term}` template, like every other word in this file. */
  label: string;
  value: number;
  caption: string;
};

/**
 * One view of the shared `people` directory. Donors, Sponsors, and Attendees
 * used to be near-identical copies of the People page -- donors/page.tsx and
 * sponsors/page.tsx were byte-identical after substituting the word -- so the
 * only things that actually varied are collected here and the page body is
 * shared. Adding the specced Staff type is now a config entry rather than a
 * fifth copy.
 */
export type PeopleSegment = {
  /** Route this segment lives at, used for pagination and filter links. */
  basePath: string;
  title: string;
  /**
   * Column to restrict the directory to. Omitted for the full directory,
   * which offers the role facet instead.
   */
  /** Narrows the segment to one role. Roles are additive, so this stacks. */
  filterColumn?: RoleKey;
  /** Narrows the segment to one entity type, which roles cannot express. */
  personType?: PersonType;
  /** The full directory offers a Role filter; a segment already is one. */
  showRoleFilter?: boolean;
  newPerson?: {
    triggerLabel: string;
    defaultRole?: RoleKey;
    defaultPersonType?: PersonType;
  };
  /** Noun used in row action labels, e.g. "sponsor". Lower case. */
  noun: string;
  /**
   * Its plural, e.g. "sponsors". Spelled out rather than `noun + "s"`, which is
   * what the filtered empty state used to do -- and which made the People
   * directory say "No persons match your filters".
   */
  nounPlural: string;
  emptyTitle: string;
  /** Shown when the viewer can add records; the other when they cannot. */
  emptyDescriptionManage: string;
  emptyDescriptionView: string;
  /**
   * A second sentence naming another section, appended to
   * `emptyDescriptionManage` only when the reader can reach that section
   * (#903).
   *
   * These segments are filters on the `people` directory -- role flags on a
   * person row, not modules -- so `people` being core keeps every one of them
   * reachable. What was not reachable was the advice: "or approve an
   * application from Volunteers > Applications" is a dead end for a tenant
   * whose Volunteers module is off, and "record a donation from Inventory >
   * Donations" for one without Inventory. Split out rather than gated as a
   * whole string, so the sentence before it still stands on its own.
   */
  crossSectionHint?: {
    text: string;
    access: readonly PermissionCheck[];
  };
  /** Optional tiles above the table. */
  stats?: (supabase: SupabaseServerClient) => Promise<SegmentStat[]>;
};

/**
 * Recurring vs first-time attendance, derived from check-ins rather than
 * registrations: signing up and turning up are different things, and the
 * distinction is the point of the tiles.
 */
async function attendeeStats(
  supabase: SupabaseServerClient,
): Promise<SegmentStat[]> {
  const { data } = await supabase
    .from("event_registrations")
    .select("person_id, event_id")
    .not("checked_in_at", "is", null)
    .not("person_id", "is", null);

  const eventsByPerson = new Map<string, Set<string>>();
  for (const registration of data ?? []) {
    const personId = registration.person_id as string;
    const events = eventsByPerson.get(personId) ?? new Set<string>();
    events.add(registration.event_id as string);
    eventsByPerson.set(personId, events);
  }

  let recurring = 0;
  let firstTime = 0;
  for (const events of eventsByPerson.values()) {
    if (events.size > 1) recurring += 1;
    else firstTime += 1;
  }

  return [
    {
      label: "Recurring {attendee_plural:lower}",
      value: recurring,
      caption: "Checked in to more than one event",
    },
    {
      label: "First-time {attendee_plural:lower}",
      value: firstTime,
      caption: "Checked in to exactly one event so far",
    },
  ];
}

export const PEOPLE_SEGMENT: PeopleSegment = {
  basePath: "/portal/people",
  title: "People",
  showRoleFilter: true,
  newPerson: { triggerLabel: "New Person" },
  noun: "person",
  nounPlural: "people",
  emptyTitle: "No people added yet",
  emptyDescriptionManage: "Add the first one with New Person above.",
  emptyDescriptionView:
    "People appear here once someone is added to the directory or registers for an event.",
};

export const DONORS_SEGMENT: PeopleSegment = {
  basePath: "/portal/donors",
  title: "{donor_plural}",
  filterColumn: "is_donor",
  newPerson: { triggerLabel: "New {donor}", defaultRole: "is_donor" },
  noun: "{donor:lower}",
  nounPlural: "{donor_plural:lower}",
  emptyTitle: "No {donor_plural:lower} added yet",
  emptyDescriptionManage: "Add the first one with New {donor} above.",
  crossSectionHint: {
    text: "You can also record a donation and its {donor:lower} from Inventory › Donations.",
    access: [{ resource: "inventory", level: "manage" }],
  },
  emptyDescriptionView:
    "{donor_plural} appear here once someone is added with the {donor:lower} role or recorded on a donation.",
};

export const SPONSORS_SEGMENT: PeopleSegment = {
  basePath: "/portal/sponsors",
  title: "{sponsor_plural}",
  filterColumn: "is_sponsor",
  newPerson: { triggerLabel: "New {sponsor}", defaultRole: "is_sponsor" },
  noun: "{sponsor:lower}",
  nounPlural: "{sponsor_plural:lower}",
  emptyTitle: "No {sponsor_plural:lower} added yet",
  emptyDescriptionManage: "Add the first one with New {sponsor} above.",
  crossSectionHint: {
    text: "You can also record a {sponsor:lower} on an event's Sponsors tab.",
    access: [{ resource: "events", level: "manage" }],
  },
  emptyDescriptionView:
    "{sponsor_plural} appear here once someone is added with the {sponsor:lower} role or recorded on an event's Sponsors tab.",
};

export const VOLUNTEERS_SEGMENT: PeopleSegment = {
  // Not /portal/volunteers: that is the volunteer *programme* (role types,
  // participation, applications). This is the directory filtered to people who
  // volunteer, so it lives under People and inherits its people:view guard.
  basePath: "/portal/people/volunteers",
  title: "{volunteer_plural}",
  filterColumn: "is_volunteer",
  newPerson: { triggerLabel: "New {volunteer}", defaultRole: "is_volunteer" },
  noun: "{volunteer:lower}",
  nounPlural: "{volunteer_plural:lower}",
  emptyTitle: "No {volunteer_plural:lower} added yet",
  emptyDescriptionManage: "Add the first one with New {volunteer} above.",
  crossSectionHint: {
    text: "You can also approve an application from Volunteers › Applications.",
    access: [{ resource: "volunteers", level: "manage" }],
  },
  emptyDescriptionView:
    "{volunteer_plural} appear here once someone applies, signs up for an event shift, or has hours logged.",
};

export const ATTENDEES_SEGMENT: PeopleSegment = {
  basePath: "/portal/attendees",
  title: "{attendee_plural}",
  filterColumn: "is_attendee",
  newPerson: { triggerLabel: "New {attendee}", defaultRole: "is_attendee" },
  noun: "{attendee:lower}",
  nounPlural: "{attendee_plural:lower}",
  emptyTitle: "No event {attendee_plural:lower} yet",
  emptyDescriptionManage:
    "{attendee_plural} appear here once someone registers for an event, or add one with New {attendee} above.",
  emptyDescriptionView:
    "{attendee_plural} appear here once someone registers for or is checked in at an event.",
  stats: attendeeStats,
};

export const STAFF_SEGMENT: PeopleSegment = {
  basePath: "/portal/staff",
  title: "{staff_plural}",
  filterColumn: "is_staff",
  newPerson: { triggerLabel: "New {staff}", defaultRole: "is_staff" },
  noun: "{staff:lower}",
  nounPlural: "{staff_plural:lower}",
  emptyTitle: "No {staff_plural:lower} added yet",
  emptyDescriptionManage: "Add the first one with New {staff} above.",
  crossSectionHint: {
    text: "You can also assign someone on an event's Staff tab.",
    access: [{ resource: "events", level: "manage" }],
  },
  emptyDescriptionView:
    "{staff_plural} appear here once someone is added with the {staff:lower} role or assigned on an event's Staff tab.",
};

export const PARTNERS_SEGMENT: PeopleSegment = {
  basePath: "/portal/partners",
  title: "{partner_plural}",
  filterColumn: "is_partner",
  newPerson: {
    // A partner is almost always an organization, and the form requires a
    // role, so the dialog opens on the shape this segment is about.
    triggerLabel: "New {partner}",
    defaultRole: "is_partner",
    defaultPersonType: "organization",
  },
  noun: "{partner:lower}",
  nounPlural: "{partner_plural:lower}",
  emptyTitle: "No {partner_plural:lower} added yet",
  emptyDescriptionManage: "Add the first one with New {partner} above.",
  crossSectionHint: {
    text: "You can also close a partnership as won from Governance › Partnerships.",
    access: [{ resource: "governance", level: "manage" }],
  },
  emptyDescriptionView:
    "{partner_plural} appear here once a partnership opportunity is closed as won, or someone is added with the {partner:lower} role.",
};

export const ORGANIZATIONS_SEGMENT: PeopleSegment = {
  basePath: "/portal/organizations",
  title: "Organizations",
  personType: "organization",
  newPerson: {
    triggerLabel: "New Organization",
    // Organizations are most often entered as sponsors, and the person form
    // requires at least one role, so the dialog opens with a workable default
    // rather than an entity type and no role.
    defaultRole: "is_sponsor",
    defaultPersonType: "organization",
  },
  noun: "organization",
  nounPlural: "organizations",
  emptyTitle: "No organizations added yet",
  emptyDescriptionManage:
    "Add the first one with New Organization above, or tick “This is an organization” on any person record.",
  emptyDescriptionView:
    "Organizations appear here once a person record is marked as one.",
};

/**
 * A segment's "you can add one here" copy, with its cross-section hint dropped
 * for a reader who cannot reach the section it names (#903).
 *
 * The hint is genuinely useful when it applies -- "or close a partnership as
 * won from Governance > Partnerships" is how most partner rows actually come
 * into being -- and is only ever advice, never the only way in: every one of
 * these segments has its own New button right above the sentence. So the
 * ungated half always stands alone, and this only ever removes.
 */
/**
 * One segment in the tenant's own words (#911).
 *
 * A copy rather than a resolution at each render site: a segment's words reach
 * a heading, a button, two empty states, a row's action label and a page's
 * `<title>`, and one of those was always going to be missed. Everything the
 * caller reads off the returned object is a word; nothing on it is a template.
 *
 * `basePath`, `filterColumn`, `personType` and the permission checks are
 * identifiers rather than copy and pass through untouched.
 */
export function resolveSegment(
  segment: PeopleSegment,
  vocabulary: Lexicon,
): PeopleSegment {
  const named = (template: string) => applyLexicon(template, vocabulary);
  return {
    ...segment,
    title: named(segment.title),
    noun: named(segment.noun),
    nounPlural: named(segment.nounPlural),
    emptyTitle: named(segment.emptyTitle),
    emptyDescriptionManage: named(segment.emptyDescriptionManage),
    emptyDescriptionView: named(segment.emptyDescriptionView),
    newPerson: segment.newPerson && {
      ...segment.newPerson,
      triggerLabel: named(segment.newPerson.triggerLabel),
    },
    crossSectionHint: segment.crossSectionHint && {
      ...segment.crossSectionHint,
      text: named(segment.crossSectionHint.text),
    },
  };
}

/** The same, for the tiles a segment loads after it is resolved. */
export function resolveStats(
  stats: readonly SegmentStat[],
  vocabulary: Lexicon,
): SegmentStat[] {
  return stats.map((stat) => ({
    ...stat,
    label: applyLexicon(stat.label, vocabulary),
  }));
}

/**
 * @param segment already resolved by `resolveSegment`; this returns copy, not
 * a template.
 */
export function emptyManageDescription(
  segment: PeopleSegment,
  permissions: PermissionMap,
): string {
  const hint = segment.crossSectionHint;
  if (!hint || !hasAnyPermission(permissions, hint.access)) {
    return segment.emptyDescriptionManage;
  }
  return `${segment.emptyDescriptionManage} ${hint.text}`;
}
