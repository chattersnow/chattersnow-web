import { describe, expect, test } from "bun:test";
import {
  agendaItemsToAdd,
  eventOpenWork,
  type EventWorkInput,
} from "./agenda-event-work";

const NOW = new Date("2026-10-10T12:00:00Z");

const LONG_ACTION =
  "Line up two more drivers for the gear pickup run so the Saturday route is not left to one volunteer again, and confirm the van booking with the rec center before the end of the month";

// Started, attendance not logged, report not started, no retro, planning
// fields partly filled -- the most work one event can hold at once.
function input(overrides: Partial<EventWorkInput> = {}): EventWorkInput {
  return {
    event: {
      id: "event-1",
      name: "Spring Gear Swap",
      // 03:00 UTC on the 4th is still the 3rd in Denver.
      starts_at: "2026-10-04T03:00:00Z",
      timezone: "America/Denver",
      status: "published",
      event_lead_id: "person-1",
      capacity: null,
      budget_amount: null,
      attendance_count: null,
      report_status: "not_started",
    },
    retroItemCount: 0,
    openChecklistItems: [{ id: "c1", title: "Return the folding tables" }],
    openActions: [{ id: "r1", body: LONG_ACTION }],
    carriedForward: [
      {
        id: "r0",
        body: "Order wristbands earlier",
        event: {
          id: "event-0",
          name: "Fall Gear Swap",
          starts_at: "2026-04-11T16:00:00Z",
          timezone: "America/Denver",
        },
      },
    ],
    ...overrides,
  };
}

describe("eventOpenWork", () => {
  test("lists phase tasks, checklist items, then own and carried-forward actions", () => {
    const work = eventOpenWork(input(), NOW);

    expect(work.map((piece) => piece.title)).toEqual([
      "Attendance not logged",
      "After-report not started",
      "Retro not started",
      "Return the folding tables",
      LONG_ACTION,
      "Order wristbands earlier",
    ]);
    expect(work.map((piece) => piece.source.key)).toEqual([
      "event_attendance_event-1",
      "event_report_event-1",
      "event_retro_event-1",
      "event_checklist_c1",
      "retro_action_r1",
      "retro_action_r0",
    ]);
  });

  test("links each piece to the event it sits on, dated in that event's zone", () => {
    const work = eventOpenWork(input(), NOW);

    expect(work[0]!.source).toEqual({
      key: "event_attendance_event-1",
      kind: "event",
      id: "event-1",
      label: "Spring Gear Swap",
      date: "2026-10-03",
    });
    // A carried-forward action links to the earlier event it was written on.
    expect(work.at(-1)!.source).toMatchObject({
      id: "event-0",
      label: "Fall Gear Swap",
      date: "2026-04-11",
    });
  });

  test("lists action items one by one instead of the retro's count", () => {
    const titles = eventOpenWork(input(), NOW).map((piece) => piece.title);
    expect(titles.some((title) => /open action item/.test(title))).toBe(false);
  });

  test("a cancelled event has no phase work, but its checklist still counts", () => {
    const work = eventOpenWork(
      input({
        event: { ...input().event, status: "cancelled" },
        openActions: [],
        carriedForward: [],
      }),
      NOW,
    );
    expect(work.map((piece) => piece.title)).toEqual([
      "Return the folding tables",
    ]);
  });

  test("an event with nothing open has no work", () => {
    const work = eventOpenWork(
      input({
        event: {
          ...input().event,
          starts_at: "2026-11-01T16:00:00Z",
          capacity: 40,
          budget_amount: 250,
        },
        openChecklistItems: [],
        openActions: [],
        carriedForward: [],
      }),
      NOW,
    );
    expect(work).toEqual([]);
  });
});

describe("agendaItemsToAdd", () => {
  const work = eventOpenWork(input(), NOW);
  let n = 0;
  const newId = () => `new-${++n}`;

  test("turns every piece into an item on an empty agenda", () => {
    n = 0;
    const items = agendaItemsToAdd(work, [], newId);
    expect(items).toHaveLength(work.length);
    expect(items[0]).toEqual({
      id: "new-1",
      title: "Attendance not logged",
      source: work[0]!.source,
    });
  });

  test("on refresh, adds only what is not on the agenda yet", () => {
    n = 0;
    const existing = [
      // Renamed and moved, but still the same piece of work.
      { id: "a1", title: "Who logs the headcount?", source: work[0]!.source },
      { id: "a2", title: "Something the committee typed itself" },
      { id: "a3", title: "Drivers", source: work[4]!.source },
    ];
    const added = agendaItemsToAdd(work, existing, newId);
    expect(added.map((item) => item.source!.key)).toEqual([
      "event_report_event-1",
      "event_retro_event-1",
      "event_checklist_c1",
      "retro_action_r0",
    ]);
  });

  test("adds nothing when everything is already there", () => {
    const existing = agendaItemsToAdd(work, [], newId);
    expect(agendaItemsToAdd(work, existing, newId)).toEqual([]);
  });

  test("adds a piece once even if the work lists it twice", () => {
    expect(agendaItemsToAdd([work[0]!, work[0]!], [], newId)).toHaveLength(1);
  });
});
