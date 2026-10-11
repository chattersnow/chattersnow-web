import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
  DistributionDetailView,
  type DistributionDetailRow,
} from "./distribution-detail-view";

function makeMovement(
  overrides: Partial<DistributionDetailRow> = {},
): DistributionDetailRow {
  return {
    id: "movement-1",
    quantity: 2,
    occurred_at: "2026-05-01T17:30:00.000Z",
    reason: "Handed out at the swap",
    inventory_item: {
      id: "item-1",
      description: "Winter jacket",
      type: "jacket",
      size: "M",
    },
    event: { id: "event-1", name: "Winter Gear Drive" },
    recipient: {
      id: "person-1",
      name: "Riley Recipient",
      email: null,
      phone: null,
    },
    ...overrides,
  };
}

describe("DistributionDetailView", () => {
  test("shows the distribution's fields in flat cards", () => {
    render(<DistributionDetailView movement={makeMovement()} canManage />);

    expect(
      screen.getByRole("heading", { name: "Winter jacket" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Distribution details")).toBeInTheDocument();
    expect(screen.getByText("Event, recipient & notes")).toBeInTheDocument();
    expect(screen.getByText("Winter Gear Drive")).toBeInTheDocument();
    expect(screen.getByText("Riley Recipient")).toBeInTheDocument();
    expect(screen.getByText("Handed out at the swap")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("links the item to its own page for editing its details", () => {
    render(<DistributionDetailView movement={makeMovement()} canManage />);

    expect(screen.getByRole("link", { name: "Winter jacket" })).toHaveAttribute(
      "href",
      "/portal/inventory/items/item-1",
    );
  });

  test("shows dashes for a general distribution with no event or recipient", () => {
    render(
      <DistributionDetailView
        movement={makeMovement({ event: null, recipient: null, reason: null })}
        canManage
      />,
    );

    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  test("shows the recipient's as-is acknowledgement and typed name", () => {
    render(
      <DistributionDetailView
        movement={makeMovement()}
        acknowledgement={{
          acknowledgedAt: "2026-05-01T17:25:00.000Z",
          typedName: "Riley Recipient",
          method: "own_device",
          skippedReason: null,
          skippedNote: null,
        }}
        canManage
      />,
    );

    expect(screen.getByText("Given as-is")).toBeInTheDocument();
    expect(
      screen.getByText(/Acknowledged on their own phone on/),
    ).toBeInTheDocument();
    expect(screen.getByText("Name typed: Riley Recipient")).toBeInTheDocument();
  });

  test("shows why a handout was recorded without an acknowledgement", () => {
    render(
      <DistributionDetailView
        movement={makeMovement()}
        acknowledgement={{
          acknowledgedAt: null,
          typedName: null,
          method: null,
          skippedReason: "other",
          skippedNote: "Had to catch a bus",
        }}
        canManage
      />,
    );

    expect(
      screen.getByText("Not acknowledged: Other — Had to catch a bus"),
    ).toBeInTheDocument();
  });

  test("says the acknowledgement was not recorded when there is none", () => {
    render(<DistributionDetailView movement={makeMovement()} canManage />);

    expect(screen.getByText("Not recorded")).toBeInTheDocument();
  });

  test("offers edit and delete to inventory managers", () => {
    render(<DistributionDetailView movement={makeMovement()} canManage />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete distribution" }),
    ).toBeInTheDocument();
  });

  test("hides edit and delete without inventory manage access", () => {
    render(
      <DistributionDetailView movement={makeMovement()} canManage={false} />,
    );

    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete distribution" }),
    ).not.toBeInTheDocument();
  });
});
