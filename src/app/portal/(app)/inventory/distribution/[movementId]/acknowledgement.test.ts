import { describe, expect, test } from "bun:test";
import type { ItemHistoryRow } from "../../items/[itemId]/item-history";
import { acknowledgementFromHistory } from "./acknowledgement";

function row(overrides: Partial<ItemHistoryRow>): ItemHistoryRow {
  return {
    entry_kind: "movement",
    entry_id: "movement-1",
    occurred_at: "2026-05-01T17:30:00.000Z",
    donated_on: null,
    movement_type: "distributed",
    quantity: 1,
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

describe("acknowledgementFromHistory", () => {
  test("reads the acknowledgement off this movement's row", () => {
    const rows = [
      row({ entry_id: "movement-0", as_is_acknowledged_at: "2026-04-01" }),
      row({
        as_is_acknowledged_at: "2026-05-01T17:25:00.000Z",
        as_is_typed_name: "  Riley Recipient ",
        as_is_method: "staff_device",
      }),
    ];

    expect(acknowledgementFromHistory(rows, "movement-1")).toEqual({
      acknowledgedAt: "2026-05-01T17:25:00.000Z",
      typedName: "Riley Recipient",
      method: "staff_device",
      skippedReason: null,
      skippedNote: null,
    });
  });

  test("keeps a skipped reason with no acknowledgement", () => {
    const rows = [row({ as_is_skipped_reason: "no_phone" })];

    expect(acknowledgementFromHistory(rows, "movement-1")).toMatchObject({
      acknowledgedAt: null,
      skippedReason: "no_phone",
    });
  });

  test("is null when nothing was recorded or the row is missing", () => {
    expect(acknowledgementFromHistory([row({})], "movement-1")).toBeNull();
    expect(acknowledgementFromHistory([row({})], "movement-2")).toBeNull();
    expect(acknowledgementFromHistory(null, "movement-1")).toBeNull();
  });
});
