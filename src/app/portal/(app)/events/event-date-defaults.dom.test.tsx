import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { EventDateProvider } from "./event-date-defaults";
import { ShiftForm } from "./volunteers/shifts";
import { WinnerForm } from "./giveaway/winners";
import type { GiveawayPrize } from "./giveaway-actions";

// 18:00 in Denver on the 14th -- the following day in UTC, which is the whole
// point of formatting in the event's own zone.
const EVENT = {
  startsAt: "2026-03-15T00:00:00.000Z",
  endsAt: "2026-03-15T05:00:00.000Z",
  timeZone: "America/Denver",
};

function inEvent(children: ReactNode) {
  return (
    <EventDateProvider
      startsAt={EVENT.startsAt}
      endsAt={EVENT.endsAt}
      timeZone={EVENT.timeZone}
    >
      {children}
    </EventDateProvider>
  );
}

const prize: GiveawayPrize = {
  id: "prize-1",
  giveaway_id: "giveaway-1",
  prize_name: "Season pass",
  donor_person_id: null,
  donor: null,
  estimated_value: null,
  notes: null,
  source_inventory_item_id: null,
  source_monetary_donation_id: null,
  bucket_id: null,
  source_item: null,
  source_donation: null,
  giveaway_winners: null,
};

describe("event date defaults", () => {
  test("a new shift opens on the event's own start and end", () => {
    render(
      inEvent(
        <ShiftForm
          roleTypes={[]}
          onSubmit={async () => ({ success: true })}
          onCancel={() => {}}
        />,
      ),
    );

    expect(screen.getByLabelText("Starts")).toHaveValue("2026-03-14T18:00");
    expect(screen.getByLabelText("Ends")).toHaveValue("2026-03-14T23:00");
  });

  test("outside an event those fields stay empty", () => {
    render(
      <ShiftForm
        roleTypes={[]}
        onSubmit={async () => ({ success: true })}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByLabelText("Starts")).toHaveValue("");
    expect(screen.getByLabelText("Ends")).toHaveValue("");
  });

  test("a first winner opens on the event's date, in the event's zone", () => {
    render(
      inEvent(
        <WinnerForm prize={prize} onSaved={() => {}} onCancel={() => {}} />,
      ),
    );

    expect(screen.getByLabelText("Distributed on")).toHaveValue("2026-03-14");
  });

  test("a saved winner keeps what was saved, blank included", () => {
    render(
      inEvent(
        <WinnerForm
          prize={{
            ...prize,
            giveaway_winners: {
              id: "winner-1",
              giveaway_prize_id: prize.id,
              winner_name: "Jane Doe",
              winner_contact: null,
              distribution_status: "pending",
              distributed_at: null,
              notes: null,
            },
          }}
          onSaved={() => {}}
          onCancel={() => {}}
        />,
      ),
    );

    expect(screen.getByLabelText("Distributed on")).toHaveValue("");
  });
});
