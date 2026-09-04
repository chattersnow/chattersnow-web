import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { DonationRow } from "./donation-shared";
import { DonationsTable } from "./donations-table";

function makeDonation(overrides: Partial<DonationRow> = {}): DonationRow {
  return {
    id: "donation-1",
    donated_at: "2026-05-01T00:00:00.000Z",
    notes: null,
    event_id: null,
    donor: {
      id: "donor-1",
      name: "Jane Donor",
      is_anonymous: false,
      source_type: "individual",
    },
    event: null,
    inventory_items: [
      {
        id: "item-1",
        description: "Winter jacket",
        type: null,
        category_id: "category-jacket",
        category_key: "jacket",
        category_label: "Jacket",
        size: "M",
        gender: "unisex",
        condition: "good",
        face_value: null,
        status: "available",
        intended_use: "gear_library",
        photo_url: null,
        notes: null,
      },
    ],
    ...overrides,
  };
}

describe("DonationsTable", () => {
  test("shows an empty state when there are no donations", () => {
    render(<DonationsTable donations={[]} hasActiveFilters={false} />);
    expect(screen.getByText("No donations recorded yet")).toBeInTheDocument();
  });

  test("shows a filtered empty state when filters are active", () => {
    render(<DonationsTable donations={[]} hasActiveFilters={true} />);
    expect(
      screen.getByText("No donations match your filters"),
    ).toBeInTheDocument();
  });

  test("renders a row per donation with donor, items, and source event", () => {
    render(
      <DonationsTable
        donations={[
          makeDonation({
            event: { id: "event-1", name: "Winter Gear Drive" },
          }),
        ]}
        hasActiveFilters={false}
      />,
    );

    expect(screen.getByText("Jane Donor")).toBeInTheDocument();
    expect(screen.getByText(/1 item · Winter jacket/)).toBeInTheDocument();
    expect(screen.getByText("Winter Gear Drive")).toBeInTheDocument();
    // Since #469 the row's action is a link to the donation's detail page
    // rather than a sheet trigger.
    expect(
      screen.getByRole("button", { name: "View donation" }),
    ).toHaveAttribute("href", "/portal/inventory/donations/donation-1");
  });

  test("shows Anonymous for an anonymous donor and a dash with no source event", () => {
    render(
      <DonationsTable
        donations={[
          makeDonation({
            donor: {
              id: "donor-2",
              name: null,
              is_anonymous: true,
              source_type: "individual",
            },
          }),
        ]}
        hasActiveFilters={false}
      />,
    );

    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
