import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import {
  DistributionsSummary,
  ExpensesSummary,
  InKindDonationsSummary,
  SponsorsSummary,
  VolunteersSummary,
} from "./card-summaries";

function figure(summaryLabel: string, figureLabel: string) {
  const summary = within(screen.getByLabelText(summaryLabel));
  // Each figure is a label <dt> followed by its value and caption <dd>s.
  return summary.getByText(figureLabel).parentElement as HTMLElement;
}

describe("VolunteersSummary", () => {
  test("counts volunteers, shift slots, hours and the unassigned", () => {
    render(
      <VolunteersSummary
        volunteers={[
          { person_id: "v1", shift_id: "s1" },
          { person_id: "v2", shift_id: "s1" },
          { person_id: "v3", shift_id: null },
        ]}
        shifts={[{ id: "s1", target_headcount: 3 }]}
        hours={[
          { person_id: "v1", hours: "2.5" },
          { person_id: "v2", hours: 3 },
        ]}
      />,
    );

    const label = "Volunteers summary";
    expect(figure(label, "Volunteers")).toHaveTextContent("3");
    expect(figure(label, "Shift slots filled")).toHaveTextContent("2 of 3");
    expect(figure(label, "Hours logged")).toHaveTextContent("5.5");
    expect(figure(label, "Not on a shift")).toHaveTextContent("1");
  });

  test("renders nothing for an event with no volunteers or shifts", () => {
    const { container } = render(
      <VolunteersSummary volunteers={[]} shifts={[]} hours={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SponsorsSummary", () => {
  test("totals contributions and outstanding follow-ups", () => {
    render(
      <SponsorsSummary
        sponsors={[
          {
            support_type: "cash",
            contribution_value: "1250.00",
            follow_up_status: "done",
          },
          {
            support_type: "in_kind",
            contribution_value: 400,
            follow_up_status: "pending",
          },
        ]}
      />,
    );

    const label = "Sponsors summary";
    expect(figure(label, "Sponsors")).toHaveTextContent("1 cash, 1 in kind");
    expect(figure(label, "Contributed")).toHaveTextContent("$1,650.00");
    expect(figure(label, "Follow-up outstanding")).toHaveTextContent("1");
  });
});

describe("InKindDonationsSummary", () => {
  test("keeps sponsor items apart from donated ones", () => {
    render(
      <InKindDonationsSummary
        items={[
          { face_value: "20.00", sponsor_id: null, donor_id: "d1" },
          { face_value: 30, sponsor_id: null, donor_id: "d1" },
          { face_value: null, sponsor_id: null, donor_id: "d2" },
          { face_value: "100.00", sponsor_id: "s1", donor_id: "d3" },
        ]}
      />,
    );

    const label = "Donations summary";
    expect(figure(label, "Items received")).toHaveTextContent("3");
    expect(figure(label, "Items received")).toHaveTextContent("2 donors");
    expect(figure(label, "Face value")).toHaveTextContent("$50.00");
    expect(figure(label, "From sponsors")).toHaveTextContent(
      "$100.00 face value, counted under Sponsors",
    );
  });
});

describe("DistributionsSummary", () => {
  test("counts quantity, distinct recipients and value given out", () => {
    render(
      <DistributionsSummary
        distributions={[
          {
            quantity: 2,
            recipient_person_id: "r1",
            inventory_item_id: "i1",
            face_value: "15.00",
          },
          {
            quantity: 1,
            recipient_person_id: "r1",
            inventory_item_id: "i2",
            face_value: 40,
          },
          {
            quantity: 1,
            recipient_person_id: "r2",
            inventory_item_id: "i3",
            face_value: null,
          },
        ]}
      />,
    );

    const label = "Distributions summary";
    expect(figure(label, "Distributed")).toHaveTextContent("4");
    // Face value per item handed out, as Impact counts it (#1577).
    expect(figure(label, "Recipients")).toHaveTextContent("2");
    expect(figure(label, "Value given out")).toHaveTextContent("$55.00");
  });
});

describe("ExpensesSummary", () => {
  test("totals by status and measures the budget, ignoring rejected", () => {
    render(
      <ExpensesSummary
        budget="1000.00"
        expenses={[
          { status: "paid", amount: "300.00" },
          { status: "approved", amount: 150 },
          { status: "submitted", amount: "75.50" },
          { status: "rejected", amount: "999.00" },
        ]}
      />,
    );

    const label = "Expenses summary";
    expect(figure(label, "Paid")).toHaveTextContent("$300.00");
    expect(figure(label, "Approved")).toHaveTextContent("$150.00");
    expect(figure(label, "Awaiting approval")).toHaveTextContent("$75.50");
    expect(figure(label, "Budget remaining")).toHaveTextContent("$550.00");
  });

  test("leaves the budget out when the event has none", () => {
    render(
      <ExpensesSummary
        budget={null}
        expenses={[{ status: "paid", amount: "10.00" }]}
      />,
    );
    expect(screen.queryByText("Budget remaining")).toBeNull();
  });
});
