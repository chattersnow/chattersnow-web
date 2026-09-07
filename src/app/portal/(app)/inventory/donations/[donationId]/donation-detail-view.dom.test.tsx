import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { DonationRow } from "../donation-shared";
import { DonationDetailView } from "./donation-detail-view";

function makeDonation(overrides: Partial<DonationRow> = {}): DonationRow {
  return {
    id: "donation-1",
    donated_at: "2026-05-01T00:00:00.000Z",
    notes: "Dropped off at HQ",
    event_id: null,
    donor: {
      id: "donor-1",
      name: "Jane Donor",
      is_anonymous: false,
      source_type: "individual",
    },
    event: { id: "event-1", name: "Winter Gear Drive" },
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
        face_value: 40,
        status: "available",
        intended_use: "gear_library",
        photo_url: null,
        notes: "Barely used",
      },
    ],
    ...overrides,
  };
}

describe("DonationDetailView", () => {
  test("shows the donation and item details in flat cards", () => {
    render(<DonationDetailView donation={makeDonation()} />);

    expect(
      screen.getByRole("heading", { name: "Jane Donor" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Donation details")).toBeInTheDocument();
    expect(screen.getByText("Items (1)")).toBeInTheDocument();
    expect(screen.getByText("Winter Gear Drive")).toBeInTheDocument();
    expect(screen.getByText("Dropped off at HQ")).toBeInTheDocument();
    expect(screen.getByText("Winter jacket")).toBeInTheDocument();
    expect(screen.getByText("Barely used")).toBeInTheDocument();
    expect(screen.getByText("$40.00")).toBeInTheDocument();
  });

  test("shows Anonymous for an anonymous donor", () => {
    render(
      <DonationDetailView
        donation={makeDonation({
          donor: {
            id: "donor-2",
            name: null,
            is_anonymous: true,
            source_type: "individual",
          },
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Anonymous" }),
    ).toBeInTheDocument();
  });

  test("editing happens through a sheet opened from the page header", () => {
    render(<DonationDetailView donation={makeDonation()} />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
