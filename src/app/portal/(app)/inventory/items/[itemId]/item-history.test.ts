import { describe, expect, test } from "bun:test";
import { toHistoryEntries, type ItemHistoryRow } from "./item-history";

function row(overrides: Partial<ItemHistoryRow>): ItemHistoryRow {
  return {
    entry_kind: "movement",
    entry_id: "entry-1",
    occurred_at: "2026-09-20T18:00:00+00:00",
    donated_on: null,
    movement_type: null,
    quantity: null,
    reason: null,
    notes: null,
    event_id: null,
    event_name: null,
    donation_id: null,
    donor_id: null,
    donor_name: null,
    donor_is_anonymous: null,
    donor_source_type: null,
    intake_route: null,
    recipient_id: null,
    recipient_name: null,
    gear_request_id: null,
    recorded_by: null,
    recorded_by_name: null,
    ...overrides,
  };
}

const donated = row({
  entry_kind: "donated",
  entry_id: "donation-1",
  donated_on: "2026-09-18",
  donation_id: "donation-1",
  donor_id: "person-1",
  donor_name: "Alpine Gear Co.",
  donor_is_anonymous: false,
  donor_source_type: "organization",
  event_id: "event-1",
  event_name: "Fall Swap",
  intake_route: "intake_form",
  notes: "  Two boxes  ",
  recorded_by: "user-1",
  recorded_by_name: "Sam Lee",
});

describe("toHistoryEntries", () => {
  test("keeps the order it was given: movements newest first, donated last", () => {
    const entries = toHistoryEntries([
      row({ entry_id: "m2", movement_type: "distributed" }),
      row({ entry_id: "m1", movement_type: "reserved" }),
      donated,
    ]);
    expect(entries.map((entry) => entry.key)).toEqual([
      "movement-m2",
      "movement-m1",
      "donated-donation-1",
    ]);
  });

  test("a donated entry names the donor, links the donation and reads the route", () => {
    const [entry] = toHistoryEntries([donated]);
    expect(entry).toEqual({
      kind: "donated",
      key: "donated-donation-1",
      occurredAt: donated.occurred_at,
      donatedOn: "2026-09-18",
      donor: {
        label: "Alpine Gear Co.",
        href: "/portal/inventory/donations/donation-1",
        kind: "Organization",
      },
      event: { label: "Fall Swap", href: "/portal/events/event-1" },
      intakeRoute: "Donation form",
      notes: "Two boxes",
      recordedBy: "Sam Lee",
    });
  });

  test("an anonymous donor is never named", () => {
    const [entry] = toHistoryEntries([
      { ...donated, donor_is_anonymous: true },
    ]);
    expect(entry.kind === "donated" && entry.donor?.label).toBe("Anonymous");
  });

  test("a donor the reader cannot see leaves only that it was donated", () => {
    // RLS hid the donation (and so the donor): no name, no link.
    const [entry] = toHistoryEntries([
      {
        ...donated,
        donation_id: null,
        donor_id: null,
        donor_name: null,
        donated_on: null,
      },
    ]);
    expect(entry.kind).toBe("donated");
    if (entry.kind !== "donated") return;
    expect(entry.donor).toBeNull();
    expect(entry.donatedOn).toBeNull();
    expect(entry.occurredAt).toBe(donated.occurred_at);
  });

  test("a readable donation whose donor is hidden is not linked", () => {
    // The donation page needs the donor too; a link would be a 404.
    const [entry] = toHistoryEntries([
      { ...donated, donor_id: null, donor_name: null },
    ]);
    expect(entry.kind === "donated" && entry.donor).toBeNull();
  });

  test("a sponsor contribution reads as one", () => {
    const [entry] = toHistoryEntries([
      { ...donated, intake_route: "event_sponsor" },
    ]);
    expect(entry.kind === "donated" && entry.intakeRoute).toBe("Event sponsor");
  });

  test("a distribution links its own page, recipient and request", () => {
    const [entry] = toHistoryEntries([
      row({
        entry_id: "m1",
        movement_type: "distributed",
        quantity: 1,
        recipient_id: "person-2",
        recipient_name: "Jamie Rivera",
        gear_request_id: "request-1",
        event_id: "event-1",
        event_name: "Fall Swap",
        reason: "Gear library",
        recorded_by_name: "Sam Lee",
      }),
    ]);
    expect(entry).toMatchObject({
      kind: "movement",
      type: "distributed",
      typeLabel: "Distributed",
      quantity: null,
      href: "/portal/inventory/distribution/m1",
      recipient: { label: "Jamie Rivera", href: "/portal/people/person-2" },
      gearRequest: { href: "/portal/inventory/requests/request-1" },
      event: { label: "Fall Swap" },
      reason: "Gear library",
      recordedBy: "Sam Lee",
    });
  });

  test("quantity shows only above one, and only distributions link", () => {
    const [reserved] = toHistoryEntries([
      row({ movement_type: "reserved", quantity: 3 }),
    ]);
    expect(reserved).toMatchObject({ quantity: 3, href: null });
  });

  test("an event or recipient hidden by RLS is left out, not blank", () => {
    const [entry] = toHistoryEntries([
      row({
        movement_type: "distributed",
        event_id: "event-1",
        event_name: null,
        recipient_id: null,
        recipient_name: null,
      }),
    ]);
    expect(entry).toMatchObject({ event: null, recipient: null });
  });

  test("no rows is no entries", () => {
    expect(toHistoryEntries(null)).toEqual([]);
  });
});

describe("numbered-code entries (#1444)", () => {
  test("an assignment and a release carry the code and why it came off", () => {
    const [assigned, released] = toHistoryEntries([
      row({
        entry_kind: "tag_assigned",
        entry_id: "binding-1",
        reason: "CSN-007",
        recorded_by_name: "Sam",
      }),
      row({
        entry_kind: "tag_released",
        entry_id: "binding-1",
        reason: "CSN-007",
        notes: "distributed",
      }),
    ]);
    expect(assigned).toEqual({
      kind: "tag",
      key: "tag_assigned-binding-1",
      occurredAt: "2026-09-20T18:00:00+00:00",
      action: "assigned",
      code: "CSN-007",
      releaseReason: null,
      recordedBy: "Sam",
    });
    expect(released).toMatchObject({
      kind: "tag",
      key: "tag_released-binding-1",
      action: "released",
      releaseReason: "The item was distributed",
    });
  });
});
