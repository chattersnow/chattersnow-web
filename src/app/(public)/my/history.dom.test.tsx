import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DEFAULT_VOCABULARY } from "@/lib/person-roles";
import {
  EMPTY_HISTORY,
  type MyEventRegistration,
  type MyGearEntry,
  type MyGivingEntry,
  type MyHistory,
  type MyVolunteerEntry,
} from "@/lib/constituent/history";
import { MyHistorySections } from "./history";

/**
 * The component splits events against the real clock, so a literal date in a
 * fixture would start failing on the day it passed. Both of these are relative
 * to now for that reason.
 */
const IN_A_MONTH = new Date(Date.now() + 30 * 86_400_000).toISOString();
const A_MONTH_AGO = new Date(Date.now() - 30 * 86_400_000).toISOString();

const registration: MyEventRegistration = {
  registration_id: "r1",
  event_id: "e1",
  event_name: "Gear swap",
  starts_at: IN_A_MONTH,
  ends_at: null,
  timezone: "America/Denver",
  location: "The lodge",
  party_size: 2,
  attended: false,
  registered_at: "2026-05-01T17:00:00Z",
};

const hours: MyVolunteerEntry = {
  kind: "hours",
  id: "h1",
  occurred_at: null,
  occurred_on: "2026-02-04",
  status: null,
  role: "Fitter",
  event_id: null,
  event_name: null,
  event_timezone: null,
  hours: 3,
};

const donation: MyGivingEntry = {
  kind: "monetary",
  id: "m1",
  received_on: "2026-03-01",
  amount: 25,
  items: null,
  event_id: null,
  event_name: null,
};

const request: MyGearEntry = {
  kind: "request",
  id: "g1",
  occurred_at: "2026-04-01T17:00:00Z",
  status: "quoted",
  delivery_method: "shipping",
  quoted_amount: 12,
  fulfilled_at: null,
  cancelled_at: null,
  note: "Size 10 if you have it",
  items: ["A jacket"],
  quantity: null,
};

function renderHistory(history: Partial<MyHistory>) {
  return render(
    <MyHistorySections
      history={{ ...EMPTY_HISTORY, ...history }}
      vocabulary={DEFAULT_VOCABULARY}
    />,
  );
}

// The rule the ticket asks for twice -- a role the person does not hold, and a
// module the tenant has switched off -- is one rule here: a section with no
// rows is not rendered. Both arrive at this component as an empty array.
describe("a section with nothing in it", () => {
  test("is absent rather than present and empty", () => {
    renderHistory({ events: [registration] });

    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.queryByText("Volunteer activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Giving")).not.toBeInTheDocument();
    expect(screen.queryByText("Library")).not.toBeInTheDocument();
  });

  test("renders nothing at all for a person with no history", () => {
    const { container } = renderHistory({});
    expect(container).toBeEmptyDOMElement();
  });
});

describe("what each section leads with", () => {
  test("events count what is still to come, not what is done", () => {
    renderHistory({ events: [registration] });
    expect(screen.getByText("1 coming up")).toBeInTheDocument();
    expect(screen.getByText("Coming up")).toBeInTheDocument();
    expect(screen.queryByText("Past")).not.toBeInTheDocument();
  });

  test("with nothing to come, it counts what was attended", () => {
    renderHistory({
      events: [
        {
          ...registration,
          registration_id: "r0",
          starts_at: A_MONTH_AGO,
          attended: true,
        },
      ],
    });

    expect(screen.getByText("1 attended")).toBeInTheDocument();
    expect(screen.getByText("Past")).toBeInTheDocument();
    expect(screen.getByText("Attended")).toBeInTheDocument();
    expect(screen.queryByText("Coming up")).not.toBeInTheDocument();
  });

  test("volunteering leads with the hours total and its roles", () => {
    renderHistory({ volunteering: [hours] });
    expect(screen.getByText(/3 hours/)).toBeInTheDocument();
    expect(screen.getByText(/Fitter 3h/)).toBeInTheDocument();
  });

  test("giving leads with the money total", () => {
    renderHistory({ giving: [donation] });
    expect(screen.getByText("$25.00 given")).toBeInTheDocument();
  });
});

describe("a gear request", () => {
  test("says what is the requester's to do, in their words not the queue's", () => {
    renderHistory({ gear: [request] });

    expect(screen.getByText("Postage to pay")).toBeInTheDocument();
    // The staff label for this status is "Quoted", which says nothing to the
    // person waiting on it.
    expect(screen.queryByText("Quoted")).not.toBeInTheDocument();
    expect(screen.getByText("A jacket")).toBeInTheDocument();
    expect(screen.getByText(/Size 10 if you have it/)).toBeInTheDocument();
  });
});
