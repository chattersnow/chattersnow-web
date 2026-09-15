import { describe, expect, test } from "bun:test";
import {
  gearRequestStanding,
  groupGiving,
  groupVolunteering,
  isHistoryEmpty,
  splitEvents,
  volunteerApplicationStanding,
  EMPTY_HISTORY,
  type MyEventRegistration,
  type MyGivingEntry,
  type MyVolunteerEntry,
} from "./history";

const NOW = new Date("2026-06-15T18:00:00Z");

function registration(
  overrides: Partial<MyEventRegistration> & { registration_id: string },
): MyEventRegistration {
  return {
    event_id: `event-${overrides.registration_id}`,
    event_name: "An event",
    starts_at: "2026-06-01T17:00:00Z",
    ends_at: null,
    timezone: "America/Denver",
    location: null,
    party_size: 1,
    attended: false,
    registered_at: "2026-05-01T17:00:00Z",
    ...overrides,
  };
}

describe("splitEvents", () => {
  // The RPC orders newest-first, which is what these fixtures reproduce.
  const rows = [
    registration({
      registration_id: "far",
      starts_at: "2026-08-01T17:00:00Z",
    }),
    registration({
      registration_id: "soon",
      starts_at: "2026-06-20T17:00:00Z",
    }),
    registration({
      registration_id: "recent",
      starts_at: "2026-06-01T17:00:00Z",
    }),
    registration({
      registration_id: "old",
      starts_at: "2026-01-01T17:00:00Z",
    }),
  ];

  test("puts the nearest thing to now at the top of each list", () => {
    const { upcoming, past } = splitEvents(rows, NOW);
    expect(upcoming.map((row) => row.registration_id)).toEqual(["soon", "far"]);
    expect(past.map((row) => row.registration_id)).toEqual(["recent", "old"]);
  });

  test("an event that has started but not ended is still upcoming", () => {
    const running = registration({
      registration_id: "running",
      starts_at: "2026-06-14T17:00:00Z",
      ends_at: "2026-06-16T17:00:00Z",
    });
    expect(splitEvents([running], NOW).upcoming).toHaveLength(1);
  });
});

function volunteerRow(
  overrides: Partial<MyVolunteerEntry> & {
    kind: MyVolunteerEntry["kind"];
    id: string;
  },
): MyVolunteerEntry {
  return {
    occurred_at: null,
    occurred_on: null,
    status: null,
    role: null,
    event_id: null,
    event_name: null,
    event_timezone: null,
    hours: null,
    ...overrides,
  };
}

describe("groupVolunteering", () => {
  const rows = [
    volunteerRow({ kind: "application", id: "a", status: "new" }),
    volunteerRow({ kind: "signup", id: "s", event_name: "Gear swap" }),
    volunteerRow({ kind: "hours", id: "h1", hours: 3, role: "Fitter" }),
    volunteerRow({ kind: "hours", id: "h2", hours: 2.5, role: "Fitter" }),
    volunteerRow({ kind: "hours", id: "h3", hours: 4, role: "Driver" }),
    volunteerRow({ kind: "hours", id: "h4", hours: 1 }),
  ];

  test("totals every logged hour, role or no role", () => {
    expect(groupVolunteering(rows).totalHours).toBe(10.5);
  });

  test("breaks the total down by role, largest first", () => {
    expect(groupVolunteering(rows).byRole).toEqual([
      { role: "Fitter", hours: 5.5 },
      { role: "Driver", hours: 4 },
    ]);
  });

  test("splits the one result set by kind", () => {
    const grouped = groupVolunteering(rows);
    expect(grouped.applications).toHaveLength(1);
    expect(grouped.signups).toHaveLength(1);
    expect(grouped.hours).toHaveLength(4);
  });
});

describe("groupGiving", () => {
  const rows: MyGivingEntry[] = [
    {
      kind: "monetary",
      id: "m1",
      received_on: "2026-03-01",
      amount: 25,
      items: null,
      event_id: null,
      event_name: null,
    },
    {
      kind: "monetary",
      id: "m2",
      received_on: "2026-04-01",
      // numeric(10,2) reaches PostgREST as a string often enough that the
      // total has to survive one.
      amount: "17.50" as unknown as number,
      items: null,
      event_id: null,
      event_name: null,
    },
    {
      kind: "in_kind",
      id: "k1",
      received_on: "2026-05-01",
      amount: null,
      items: ["A jacket"],
      event_id: null,
      event_name: null,
    },
  ];

  test("totals money only, and reads a numeric string", () => {
    const grouped = groupGiving(rows);
    expect(grouped.monetaryTotal).toBe(42.5);
    expect(grouped.monetary).toHaveLength(2);
    expect(grouped.inKind).toHaveLength(1);
  });
});

describe("volunteerApplicationStanding", () => {
  test("every status a coordinator is still working reads as under review", () => {
    for (const status of ["new", "being reviewed", "contacted"]) {
      expect(volunteerApplicationStanding(status)).toEqual({
        label: "Being reviewed",
        tone: "open",
      });
    }
  });

  test("declined and closed are one closed standing, never the word declined", () => {
    for (const status of ["declined", "closed"]) {
      expect(volunteerApplicationStanding(status)).toEqual({
        label: "Closed",
        tone: "closed",
      });
    }
  });

  test("placed is the only one that reads as finished", () => {
    expect(volunteerApplicationStanding("placed").tone).toBe("done");
  });
});

describe("gearRequestStanding", () => {
  test("says what is the requester's to do", () => {
    expect(gearRequestStanding("quoted").label).toBe("Postage to pay");
    expect(gearRequestStanding("paid").tone).toBe("open");
    expect(gearRequestStanding("fulfilled").tone).toBe("done");
    expect(gearRequestStanding("cancelled").tone).toBe("closed");
  });

  test("an unknown status reads as in progress rather than as itself", () => {
    // The staff label falls through to the raw value; this one must not, since
    // an internal word in a badge is exactly what this mapping exists to stop.
    expect(gearRequestStanding("some_future_status").label).toBe(
      "Being prepared",
    );
  });
});

describe("isHistoryEmpty", () => {
  test("is true for an account with a record and nothing on it", () => {
    expect(isHistoryEmpty(EMPTY_HISTORY)).toBe(true);
  });

  test("one row in any section is enough", () => {
    expect(
      isHistoryEmpty({
        ...EMPTY_HISTORY,
        events: [registration({ registration_id: "one" })],
      }),
    ).toBe(false);
  });
});
