import { labelFor } from "@/lib/inventory";
import { SOURCE_TYPES } from "../../donations/donation-shared";

/**
 * One row of `inventory_item_history` (#1442). The function is security
 * invoker, so anything the reader's RLS hides -- the donation, the donor, an
 * event, a recipient -- arrives null rather than removing the entry. The
 * generated types report every column non-null, which is not true of a
 * function's table columns, so this is the shape the mapping trusts instead.
 */
export type ItemHistoryRow = {
  entry_kind: string;
  entry_id: string | null;
  occurred_at: string;
  donated_on: string | null;
  movement_type: string | null;
  quantity: number | null;
  reason: string | null;
  notes: string | null;
  event_id: string | null;
  event_name: string | null;
  donation_id: string | null;
  donor_id: string | null;
  donor_name: string | null;
  donor_is_anonymous: boolean | null;
  donor_source_type: string | null;
  intake_route: string | null;
  recipient_id: string | null;
  recipient_name: string | null;
  gear_request_id: string | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
};

type Link = { label: string; href: string };

export type DonatedEntry = {
  kind: "donated";
  key: string;
  /** The instant the intake was recorded, for a reader who can't read the
   *  donation's own calendar date. */
  occurredAt: string;
  /** The donation's `donated_at` -- a calendar date, never zone-shifted. */
  donatedOn: string | null;
  /** Null when the reader may not see who gave it. */
  donor: (Link & { kind: string | null }) | null;
  event: Link | null;
  intakeRoute: string | null;
  notes: string | null;
  recordedBy: string | null;
};

export type MovementEntry = {
  kind: "movement";
  key: string;
  occurredAt: string;
  type: string;
  typeLabel: string;
  /** Only when more than one, which is the only time it says anything. */
  quantity: number | null;
  /** The distribution's own page, for a distributed movement. */
  href: string | null;
  event: Link | null;
  recipient: Link | null;
  gearRequest: Link | null;
  reason: string | null;
  notes: string | null;
  recordedBy: string | null;
};

export type HistoryEntry = DonatedEntry | MovementEntry;

export const MOVEMENT_TYPES = [
  { value: "received", label: "Received" },
  { value: "distributed", label: "Distributed" },
  { value: "reserved", label: "Reserved" },
  { value: "damaged", label: "Damaged" },
  { value: "lost", label: "Lost" },
  { value: "retired", label: "Retired" },
  { value: "corrected", label: "Corrected" },
  { value: "other", label: "Other" },
];

const INTAKE_ROUTES = [
  { value: "intake_form", label: "Donation form" },
  { value: "event_sponsor", label: "Event sponsor" },
];

function eventLink(row: ItemHistoryRow): Link | null {
  return row.event_id && row.event_name
    ? { label: row.event_name, href: `/portal/events/${row.event_id}` }
    : null;
}

function toDonated(row: ItemHistoryRow): DonatedEntry {
  // The donation page joins `donor:people!inner`, so it opens only for a
  // reader who can see the donor too. Linking without one would be a 404.
  const donor =
    row.donation_id && row.donor_id
      ? {
          label: row.donor_is_anonymous
            ? "Anonymous"
            : row.donor_name?.trim() || "—",
          href: `/portal/inventory/donations/${row.donation_id}`,
          kind: labelFor(SOURCE_TYPES, row.donor_source_type) || null,
        }
      : null;
  return {
    kind: "donated",
    key: `donated-${row.entry_id ?? "item"}`,
    occurredAt: row.occurred_at,
    donatedOn: row.donated_on,
    donor,
    event: eventLink(row),
    intakeRoute: labelFor(INTAKE_ROUTES, row.intake_route) || null,
    notes: row.notes?.trim() || null,
    recordedBy: row.recorded_by_name?.trim() || null,
  };
}

function toMovement(row: ItemHistoryRow): MovementEntry {
  const type = row.movement_type ?? "other";
  return {
    kind: "movement",
    key: `movement-${row.entry_id}`,
    occurredAt: row.occurred_at,
    type,
    typeLabel: labelFor(MOVEMENT_TYPES, type) || type,
    quantity: row.quantity && row.quantity > 1 ? row.quantity : null,
    href:
      type === "distributed" && row.entry_id
        ? `/portal/inventory/distribution/${row.entry_id}`
        : null,
    event: eventLink(row),
    recipient:
      row.recipient_id && row.recipient_name?.trim()
        ? {
            label: row.recipient_name.trim(),
            href: `/portal/people/${row.recipient_id}`,
          }
        : null,
    gearRequest: row.gear_request_id
      ? {
          label: "Gear request",
          href: `/portal/inventory/requests/${row.gear_request_id}`,
        }
      : null,
    reason: row.reason?.trim() || null,
    notes: row.notes?.trim() || null,
    recordedBy: row.recorded_by_name?.trim() || null,
  };
}

/** The rows as the History card renders them, in the order they came. */
export function toHistoryEntries(
  rows: ItemHistoryRow[] | null | undefined,
): HistoryEntry[] {
  return (rows ?? []).map((row) =>
    row.entry_kind === "donated" ? toDonated(row) : toMovement(row),
  );
}
