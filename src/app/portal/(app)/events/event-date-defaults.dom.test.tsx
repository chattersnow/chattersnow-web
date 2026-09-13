// Pinned before anything constructs a Date, because these defaults are read in
// the *browser's* zone (#1055) and would otherwise assert whatever zone the
// machine running the suite happens to be in. New York is deliberately not the
// event's own zone: that is what makes the expectations below evidence of
// which of the two zones won.
process.env.TZ = "America/New_York";

import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { EventDateProvider } from "./event-date-defaults";
import { ShiftForm } from "./volunteers/shifts";
import { WinnerForm } from "./giveaway/winners";
import type { GiveawayPrize } from "./giveaway-actions";

// 18:00 on the 14th in Denver, the event's own zone; 20:00 on the 14th in New
// York, the reader's; the 15th in UTC. Three different answers from one
// instant, so every assertion below names which one the forms use.
const EVENT = {
  startsAt: "2026-03-15T00:00:00.000Z",
  endsAt: "2026-03-15T05:00:00.000Z",
};

function inEvent(children: ReactNode) {
  return (
    <EventDateProvider startsAt={EVENT.startsAt} endsAt={EVENT.endsAt}>
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
  test("a new shift opens on the event's start and end, in the reader's zone", () => {
    render(
      inEvent(
        <ShiftForm
          roleTypes={[]}
          onSubmit={async () => ({ success: true })}
          onCancel={() => {}}
        />,
      ),
    );

    // 20:00, not Denver's 18:00: the reader's own clock, which is the zone
    // ShiftForm converts back from on submit.
    expect(screen.getByLabelText("Starts")).toHaveValue("2026-03-14T20:00");
    expect(screen.getByLabelText("Ends")).toHaveValue("2026-03-15T01:00");
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

  test("a first winner opens on the event's date, in the reader's zone", () => {
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
