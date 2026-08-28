import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ActiveEventCard } from "./active-event-card";
import type { ActiveEventForPerson } from "./queries";

function event(overrides: Partial<ActiveEventForPerson> = {}) {
  return {
    id: "event-1",
    name: "Winter Gear Giveaway",
    location: "Community Center",
    starts_at: new Date().toISOString(),
    ends_at: null,
    timezone: "America/Chicago",
    capacity: 50,
    ...overrides,
  } satisfies ActiveEventForPerson;
}

describe("ActiveEventCard", () => {
  test("hides all quick actions when the viewer has no relevant permissions", () => {
    render(
      <ActiveEventCard
        event={event()}
        canCheckIn={false}
        canRecordDonation={false}
        canRecordDistribution={false}
      />,
    );

    expect(screen.queryByRole("button", { name: "Check in" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Accept a donation" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Record a distribution" }),
    ).toBeNull();
  });

  test("shows the check-in quick action alongside donation and distribution actions", () => {
    render(
      <ActiveEventCard
        event={event()}
        canCheckIn={true}
        canRecordDonation={true}
        canRecordDistribution={true}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Check in" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept a donation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record a distribution" }),
    ).toBeInTheDocument();
  });

  test("shows only the check-in action when that's the only permission granted", () => {
    render(
      <ActiveEventCard
        event={event()}
        canCheckIn={true}
        canRecordDonation={false}
        canRecordDistribution={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Check in" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept a donation" }),
    ).toBeNull();
  });
});
