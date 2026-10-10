import type { EventRegistrant } from "../events/registrants-actions";
import { matchesQuery } from "../events/registrants-view-state";

/**
 * The phone check-in sheet's list (#1558), as pure functions so the order and
 * the filters can be tested without rendering anything.
 */
export type DoorTab = "out" | "in" | "all";

/**
 * The last word of the name, which is what a door reads a list by. Not a real
 * surname parser -- nothing could be, across the names a tenant registers --
 * but "María Fernanda Castillo-Wojciechowski" files under C, and a one-word
 * name files under itself.
 */
export function lastNameKey(name: string): string {
  const words = name.trim().split(/\s+/);
  return words[words.length - 1] ?? "";
}

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

function byLastName(a: EventRegistrant, b: EventRegistrant): number {
  return (
    collator.compare(lastNameKey(a.name), lastNameKey(b.name)) ||
    collator.compare(a.name, b.name)
  );
}

/** Who is still to come first, then who is through the door. */
function notHereFirst(a: EventRegistrant, b: EventRegistrant): number {
  return (
    Number(a.checked_in_at !== null) - Number(b.checked_in_at !== null) ||
    byLastName(a, b)
  );
}

/**
 * The rows a tab shows. A search looks across every registration whatever the
 * tab says: somebody at the door asking "am I on the list?" is not answered by
 * "not on this tab".
 */
export function doorRows(
  list: readonly EventRegistrant[],
  tab: DoorTab,
  query: string,
): EventRegistrant[] {
  const needle = query.trim().toLowerCase();
  if (needle) {
    return list
      .filter((registrant) => matchesQuery(registrant, needle))
      .sort(notHereFirst);
  }
  if (tab === "all") return [...list].sort(notHereFirst);
  return list
    .filter(
      (registrant) => (registrant.checked_in_at !== null) === (tab === "in"),
    )
    .sort(byLastName);
}

export type DoorCounts = {
  out: number;
  in: number;
  all: number;
  /** People, not parties: the figure a capacity is set in. */
  peopleIn: number;
  people: number;
};

export function doorCounts(list: readonly EventRegistrant[]): DoorCounts {
  let checkedIn = 0;
  let peopleIn = 0;
  let people = 0;
  for (const registrant of list) {
    people += registrant.party_size;
    if (registrant.checked_in_at !== null) {
      checkedIn += 1;
      peopleIn += registrant.party_size;
    }
  }
  return {
    out: list.length - checkedIn,
    in: checkedIn,
    all: list.length,
    peopleIn,
    people,
  };
}

/** Cancelled registrations a search turns up, so one can be restored. */
export function cancelledMatches(
  cancelled: readonly EventRegistrant[],
  query: string,
): EventRegistrant[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return cancelled
    .filter((registrant) => matchesQuery(registrant, needle))
    .sort(byLastName);
}
