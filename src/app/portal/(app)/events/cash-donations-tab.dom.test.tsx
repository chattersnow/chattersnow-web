import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import type {
  EventMonetaryDonationRow,
  EventMonetaryDonations,
} from "../finance/donations/actions";

const listEventMonetaryDonationsActionMock = mock<
  (eventId: string) => Promise<{ data: EventMonetaryDonations }>
>(async () => ({ data: { rows: [], canOpenLedger: false } }));

mock.module("../finance/donations/actions", () => ({
  listEventMonetaryDonationsAction: listEventMonetaryDonationsActionMock,
}));

const { CashDonationsTab } = await import("./cash-donations-tab");

function gift(
  overrides: Partial<EventMonetaryDonationRow> = {},
): EventMonetaryDonationRow {
  return {
    id: crypto.randomUUID(),
    donor_id: "person-1",
    event_id: "event-1",
    amount: "40.00",
    method: "cash",
    received_date: "2026-01-05",
    notes: null,
    source: "manual",
    external_reference: null,
    processor_label: null,
    gross_amount: null,
    fee_amount: null,
    people: { name: "Jamie Rivera" },
    events: { name: "Winter Gear Swap" },
    event_sponsors: [],
    ...overrides,
  };
}

function respondWith(data: EventMonetaryDonations) {
  listEventMonetaryDonationsActionMock.mockImplementation(async () => ({
    data,
  }));
}

beforeEach(() => {
  listEventMonetaryDonationsActionMock.mockClear();
});

describe("CashDonationsTab", () => {
  test("lists the event's gifts and totals a sponsorship apart from donations", async () => {
    respondWith({
      rows: [
        gift(),
        gift({
          donor_id: null,
          people: null,
          amount: "250.00",
          event_sponsors: [{ id: "sponsor-1" }],
        }),
      ],
      canOpenLedger: true,
    });
    render(<CashDonationsTab eventId="event-1" mode="view" />);

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getByText("Sponsorship")).toBeInTheDocument();
    const summary = within(screen.getByLabelText("Cash donations summary"));
    expect(summary.getByText("$40.00")).toBeInTheDocument();
    expect(summary.getByText("1 gift")).toBeInTheDocument();
    // Counted once, under Sponsors -- never added into the donations total.
    expect(summary.getByText("$250.00")).toBeInTheDocument();
    expect(
      summary.getByText("1 gift, counted under Sponsors"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open in Finance" }),
    ).toHaveAttribute("href", "/portal/finance/donations?event=event-1");
    expect(listEventMonetaryDonationsActionMock).toHaveBeenCalledWith(
      "event-1",
    );
  });

  test("offers no Finance link to a reader who cannot open the ledger", async () => {
    respondWith({ rows: [gift()], canOpenLedger: false });
    render(<CashDonationsTab eventId="event-1" mode="view" />);

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("past the preview, links to the full list instead of showing it", async () => {
    respondWith({
      rows: Array.from({ length: 7 }, () => gift()),
      canOpenLedger: true,
    });
    render(<CashDonationsTab eventId="event-1" mode="view" previewRows={5} />);

    expect(await screen.findAllByText("Jamie Rivera")).toHaveLength(5);
    // The summary covers every gift, not just the preview.
    const summary = within(screen.getByLabelText("Cash donations summary"));
    expect(summary.getByText("$280.00")).toBeInTheDocument();
    expect(summary.getByText("7 gifts")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View all 7 in Finance" }),
    ).toBeInTheDocument();
  });

  test("says so when nothing is linked to the event", async () => {
    respondWith({ rows: [], canOpenLedger: true });
    render(<CashDonationsTab eventId="event-1" mode="view" />);

    expect(
      await screen.findByText("No cash donations linked to this event yet"),
    ).toBeInTheDocument();
  });
});
