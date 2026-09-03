import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { RoleKey } from "./people-shared";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export type SegmentStat = {
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
  filterColumn?: RoleKey | "is_organization";
  /** The full directory offers a Role filter; a segment already is one. */
  showRoleFilter?: boolean;
  newPerson?: {
    triggerLabel: string;
    defaultRole?: RoleKey;
    defaultIsOrganization?: boolean;
  };
  /** Noun used in empty states and row action labels, e.g. "sponsor". */
  noun: string;
  emptyTitle: string;
  /** Shown when the viewer can add records; the other when they cannot. */
  emptyDescriptionManage: string;
  emptyDescriptionView: string;
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
      label: "Recurring attendees",
      value: recurring,
      caption: "Checked in to more than one event",
    },
    {
      label: "First-time attendees",
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
  emptyTitle: "No people added yet",
  emptyDescriptionManage: "Add the first one with New Person above.",
  emptyDescriptionView:
    "People appear here once someone is added to the directory or registers for an event.",
};

export const DONORS_SEGMENT: PeopleSegment = {
  basePath: "/portal/donors",
  title: "Donors",
  filterColumn: "is_donor",
  newPerson: { triggerLabel: "New Donor", defaultRole: "is_donor" },
  noun: "donor",
  emptyTitle: "No donors added yet",
  emptyDescriptionManage:
    "Add the first one with New Donor above, or record a donation and its donor from Inventory › Donations.",
  emptyDescriptionView:
    "Donors appear here once someone is added with the donor role or recorded on a donation.",
};

export const SPONSORS_SEGMENT: PeopleSegment = {
  basePath: "/portal/sponsors",
  title: "Sponsors",
  filterColumn: "is_sponsor",
  newPerson: { triggerLabel: "New Sponsor", defaultRole: "is_sponsor" },
  noun: "sponsor",
  emptyTitle: "No sponsors added yet",
  emptyDescriptionManage:
    "Add the first one with New Sponsor above, or record a sponsor on an event's Sponsors tab.",
  emptyDescriptionView:
    "Sponsors appear here once someone is added with the sponsor role or recorded on an event's Sponsors tab.",
};

export const ATTENDEES_SEGMENT: PeopleSegment = {
  basePath: "/portal/attendees",
  title: "Attendees",
  filterColumn: "is_attendee",
  newPerson: { triggerLabel: "New Attendee", defaultRole: "is_attendee" },
  noun: "attendee",
  emptyTitle: "No event attendees yet",
  emptyDescriptionManage:
    "Attendees appear here once someone registers for an event, or add one with New Attendee above.",
  emptyDescriptionView:
    "Attendees appear here once someone registers for or is checked in at an event.",
  stats: attendeeStats,
};

export const ORGANIZATIONS_SEGMENT: PeopleSegment = {
  basePath: "/portal/organizations",
  title: "Organizations",
  filterColumn: "is_organization",
  newPerson: {
    triggerLabel: "New Organization",
    // Organizations are most often entered as sponsors, and the person form
    // requires at least one role, so the dialog opens with a workable default
    // rather than an entity type and no role.
    defaultRole: "is_sponsor",
    defaultIsOrganization: true,
  },
  noun: "organization",
  emptyTitle: "No organizations added yet",
  emptyDescriptionManage:
    "Add the first one with New Organization above, or tick “This is an organization” on any person record.",
  emptyDescriptionView:
    "Organizations appear here once a person record is marked as one.",
};
