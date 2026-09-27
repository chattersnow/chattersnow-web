import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import { ItemHistoryCard } from "./item-history-card";
import type { HistoryEntry } from "./item-history";

const entries: HistoryEntry[] = [
  {
    kind: "movement",
    key: "movement-m1",
    occurredAt: "2026-09-21T18:00:00Z",
    type: "distributed",
    typeLabel: "Distributed",
    quantity: null,
    href: "/portal/inventory/distribution/m1",
    event: null,
    recipient: { label: "Jamie Rivera", href: "/portal/people/person-2" },
    gearRequest: null,
    reason: null,
    notes: null,
    recordedBy: "Sam Lee",
  },
  {
    kind: "donated",
    key: "donated-d1",
    occurredAt: "2026-09-18T18:00:00Z",
    donatedOn: "2026-09-18",
    donor: {
      label: "Alpine Gear Co.",
      href: "/portal/inventory/donations/d1",
      kind: "Organization",
    },
    event: { label: "Fall Swap", href: "/portal/events/e1" },
    intakeRoute: "Donation form",
    notes: null,
    recordedBy: "Pat Kim",
  },
];

describe("ItemHistoryCard", () => {
  test("lists the entries in order with who, where and to whom", () => {
    render(<ItemHistoryCard entries={entries} />);
    const items = within(
      screen.getByRole("list", { name: "Item history" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Distributed")).toBeInTheDocument();
    expect(
      within(items[0]).getByRole("link", { name: "Jamie Rivera" }),
    ).toHaveAttribute("href", "/portal/people/person-2");
    expect(within(items[1]).getByText("Donated")).toBeInTheDocument();
    expect(within(items[1]).getByText("Sep 18, 2026")).toBeInTheDocument();
    expect(
      within(items[1]).getByRole("link", { name: "Alpine Gear Co." }),
    ).toHaveAttribute("href", "/portal/inventory/donations/d1");
    expect(within(items[1]).getByText("Pat Kim")).toBeInTheDocument();
  });

  test("a hidden donor leaves no Donor line", () => {
    render(
      <ItemHistoryCard
        entries={[
          { ...(entries[1] as HistoryEntry), donor: null } as HistoryEntry,
        ]}
      />,
    );
    expect(screen.getByText("Donated")).toBeInTheDocument();
    expect(screen.queryByText("Donor")).toBeNull();
    expect(screen.queryByText("Alpine Gear Co.")).toBeNull();
  });

  test("no entries says so", () => {
    render(<ItemHistoryCard entries={[]} />);
    expect(screen.getByText("No history recorded yet.")).toBeInTheDocument();
  });
});
