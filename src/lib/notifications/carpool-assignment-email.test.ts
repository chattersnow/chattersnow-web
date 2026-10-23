import { describe, expect, test } from "bun:test";
import { toCarpoolAssignment } from "@/lib/carpool-assignment";
import {
  carpoolAssignmentSummary,
  renderCarpoolAssignmentEmail,
  type CarpoolAssignmentMessage,
} from "./carpool-assignment-email";

const car = toCarpoolAssignment({
  car_label: "Car <2>",
  leaving_from: "Union Square",
  role: "passenger",
  party_size: 1,
  driver: {
    first_name: "Dana",
    instagram_handle: "dana.drives",
    has_no_instagram: false,
    party_size: 1,
  },
  riders: [],
})!;

const base: CarpoolAssignmentMessage = {
  orgName: "Chatter Snow",
  firstName: "Riley",
  eventName: "Pride Ride Day",
  car,
  notice: ["Costs are split in the car."],
  answersLink: {
    url: "https://chattersnow.example/events/e/abc/answers?t=secret-token",
    expiresAt: "2026-03-15T06:00:00.000Z",
  },
  timeZone: "America/Denver",
  siteUrl: "https://chattersnow.example",
};

describe("renderCarpoolAssignmentEmail (#1651)", () => {
  test("carries the card, the notice and their link in both parts", () => {
    const { subject, text, html } = renderCarpoolAssignmentEmail(base);
    expect(subject).toBe("Your carpool for Pride Ride Day");
    expect(text).toContain("Hi Riley,");
    expect(text).toContain("  Driver: Dana · @dana.drives");
    expect(text).toContain("Carpool costs:\nCosts are split in the car.");
    expect(text).toContain("secret-token");
    expect(html).toContain("Car &lt;2&gt;");
    expect(html).toContain("<strong>Carpool costs</strong>");
    expect(html).toContain("secret-token");
    expect(text).toContain("MDT");
  });

  test("sends the assignment without a link where none was issued", () => {
    const { text, html } = renderCarpoolAssignmentEmail({
      ...base,
      answersLink: null,
    });
    expect(text).not.toContain("See your carpool and answers");
    expect(html).not.toContain("See your carpool and answers");
  });

  test("the history copy is the card alone, never the link", () => {
    const summary = carpoolAssignmentSummary(car, "Chatter Snow");
    expect(summary).toContain("Car: Car <2>");
    expect(summary).not.toContain("secret-token");
  });
});
