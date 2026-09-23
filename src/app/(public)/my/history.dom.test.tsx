import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DEFAULT_LEXICON } from "@/lib/lexicon";
import { DEFAULT_VOCABULARY } from "@/lib/person-roles";
import {
  EMPTY_HISTORY,
  type MyEventRegistration,
  type MyGearEntry,
  type MyGivingEntry,
  type MyHistory,
  type MyVolunteerEntry,
} from "@/lib/constituent/history";
mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
mock.module("./registration-cancel-actions", () => ({
  cancelMyRegistrationAction: async () => ({ success: true }),
}));

const { MyHistorySections } = await import("./history");
import { MyNextSteps } from "./next-steps";

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
  cancelled_at: null,
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

// #1183. The strip is a lede, so what every case below really asks is whether
// it says less than the sections it sits above -- never more, and never
// something they would contradict.
describe("the summary strip", () => {
  test("is absent when only one section renders, because that section is already the summary", () => {
    renderHistory({ events: [registration] });
    expect(screen.queryByRole("link", { name: /Coming up/ })).toBeNull();
  });

  test("leads with one number per section once two of them render", () => {
    renderHistory({ events: [registration], giving: [donation] });

    expect(
      screen.getByRole("link", { name: "1 Coming up" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "$25.00 Given" }),
    ).toBeInTheDocument();
  });

  test("each stat links to the section it was counted from", () => {
    renderHistory({ volunteering: [hours], gear: [request] });

    expect(screen.getByRole("link", { name: "3 Hours" })).toHaveAttribute(
      "href",
      "#my-volunteering",
    );
    // "Postage to pay" is an open standing, so the request is still the
    // requester's to act on and is counted.
    expect(
      screen.getByRole("link", { name: "1 Open request" }),
    ).toHaveAttribute("href", "#my-gear");

    expect(document.getElementById("my-volunteering")).toBeInTheDocument();
    expect(document.getElementById("my-gear")).toBeInTheDocument();
  });

  test("falls back from what is coming up to what was attended, as the section does", () => {
    renderHistory({
      events: [
        {
          ...registration,
          registration_id: "r0",
          starts_at: A_MONTH_AGO,
          attended: true,
        },
      ],
      giving: [donation],
    });

    expect(screen.getByRole("link", { name: "1 Attended" })).toHaveAttribute(
      "href",
      "#my-events",
    );
  });

  test("omits a section whose number is zero rather than opening with a nought", () => {
    renderHistory({
      // A past event nobody marked attended, and a fulfilled request: two
      // sections render, and neither has a number worth leading with.
      events: [
        { ...registration, registration_id: "r0", starts_at: A_MONTH_AGO },
      ],
      gear: [{ ...request, status: "fulfilled" }],
    });

    expect(screen.queryByRole("link", { name: /Open request/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Attended/ })).toBeNull();
  });
});

// #1183. The dead end this closes is a linked account with nothing on it yet --
// the state somebody is in the moment their claim is approved.
describe("next steps on an empty record", () => {
  test("offers the destinations that put something on the record", () => {
    render(<MyNextSteps hidden={[]} lexicon={DEFAULT_LEXICON} />);

    expect(screen.getByRole("link", { name: "Find an event" })).toHaveAttribute(
      "href",
      "/events",
    );
    expect(
      screen.getByRole("link", { name: "Volunteer with us" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Make a donation" }),
    ).toBeInTheDocument();
  });

  test("names the collection with the tenant's word, not Chatter Snow's", () => {
    render(
      <MyNextSteps
        hidden={[]}
        lexicon={{ ...DEFAULT_LEXICON, collection_public: "Food Pantry" }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Browse the food pantry" }),
    ).toBeInTheDocument();
  });

  test("offers nothing whose public page the tenant has hidden", () => {
    render(
      <MyNextSteps hidden={["events", "gears"]} lexicon={DEFAULT_LEXICON} />,
    );

    expect(screen.queryByRole("link", { name: "Find an event" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Browse the/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Volunteer with us" }),
    ).toBeInTheDocument();
  });

  test("renders nothing at all when every destination is hidden", () => {
    const { container } = render(
      <MyNextSteps
        hidden={[
          "events",
          "gears",
          "get-involved",
          "get-involved-volunteer",
          "support",
        ]}
        lexicon={DEFAULT_LEXICON}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("an upcoming registration (#1418)", () => {
  test('offers "I can\'t make it" while it is active', () => {
    render(
      <MyHistorySections
        history={{ ...EMPTY_HISTORY, events: [registration] }}
        vocabulary={DEFAULT_VOCABULARY}
      />,
    );
    expect(
      screen.getByRole("button", { name: "I can't make it" }),
    ).toBeTruthy();
  });

  test("once cancelled, says so, offers nothing and is not coming up", () => {
    render(
      <MyHistorySections
        history={{
          ...EMPTY_HISTORY,
          events: [{ ...registration, cancelled_at: "2026-05-02T17:00:00Z" }],
        }}
        vocabulary={DEFAULT_VOCABULARY}
      />,
    );
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "I can't make it" }),
    ).toBeNull();
    expect(screen.queryByText(/coming up/)).toBeNull();
  });
});
