import { describe, expect, test } from "bun:test";
import { toCarpoolAssignment } from "@/lib/carpool-assignment";
import { DEFAULT_REMINDER_INTRO } from "@/lib/event-reminders";
import {
  eventReminderSummary,
  renderEventReminderEmail,
  type EventReminderMessage,
} from "./event-reminder-email";

const car = toCarpoolAssignment({
  car_label: "Car 2",
  leaving_from: "Union Square",
  role: "passenger",
  party_size: 1,
  driver: {
    first_name: "Dana",
    instagram_handle: "dana.drives",
    has_no_instagram: false,
    party_size: 1,
  },
  riders: [
    {
      first_name: "Sam",
      instagram_handle: null,
      has_no_instagram: true,
      party_size: 2,
    },
  ],
})!;

const base: EventReminderMessage = {
  orgName: "Chatter Snow",
  firstName: "Riley",
  eventName: "Pride Ride Day",
  startsAt: "2026-03-14T15:00:00.000Z",
  endsAt: "2026-03-14T23:00:00.000Z",
  timeZone: "America/Denver",
  location: "Loveland <Pass>",
  intro: null,
  carpool: null,
  answersLink: {
    url: "https://chattersnow.example/events/e/abc/answers?t=secret-token",
    expiresAt: "2026-03-14T23:00:00.000Z",
  },
  accountUrl: null,
  siteUrl: "https://chattersnow.example",
};

describe("renderEventReminderEmail (#1652)", () => {
  test("names the day in the subject and the times in the event's zone", () => {
    const { subject, text, html } = renderEventReminderEmail(base);
    expect(subject).toBe("Reminder: Pride Ride Day is on Saturday, March 14");
    expect(text).toContain("Hi Riley,");
    expect(text).toContain(DEFAULT_REMINDER_INTRO);
    expect(text).toContain("  When: ");
    expect(text).toContain("MDT");
    expect(text).toContain("  Where: Loveland <Pass>");
    expect(html).toContain("Loveland &lt;Pass&gt;");
    expect(text).toContain("Change your answers: ");
    expect(html).toContain("secret-token");
  });

  test("uses the staff intro when there is one", () => {
    const { text } = renderEventReminderEmail({
      ...base,
      intro: "Bring layers!",
    });
    expect(text).toContain("Bring layers!");
    expect(text).not.toContain(DEFAULT_REMINDER_INTRO);
  });

  test("shows their car and the notice", () => {
    const { text, html } = renderEventReminderEmail({
      ...base,
      carpool: { car, notice: ["Costs are split in the car."] },
    });
    expect(text).toContain("Your carpool:");
    expect(text).toContain("  Driver: Dana · @dana.drives");
    expect(text).toContain("Carpool costs:\nCosts are split in the car.");
    expect(text).toContain("See your carpool and answers: ");
    expect(html).toContain("<strong>Your carpool</strong>");
  });

  test("says when they are in no car yet, without the notice", () => {
    const { text, html } = renderEventReminderEmail({
      ...base,
      carpool: { car: null, notice: ["Costs are split in the car."] },
    });
    expect(text).toContain("You haven't been placed in a car yet.");
    expect(html).toContain("You haven&#39;t been placed in a car yet.");
    expect(text).not.toContain("Carpool costs");
  });

  test("sends without a link where none was issued, and adds the account link", () => {
    const { text, html } = renderEventReminderEmail({
      ...base,
      answersLink: null,
      accountUrl: "https://chattersnow.example/my/registration/r1",
    });
    expect(text).not.toContain("Change your answers");
    expect(text).toContain(
      "See your registration: https://chattersnow.example/my/registration/r1",
    );
    expect(html).toContain("/my/registration/r1");
  });

  test("the history copy is the details and car, never the link", () => {
    const summary = eventReminderSummary({
      ...base,
      carpool: { car, notice: [] },
    });
    expect(summary).toContain("What: Pride Ride Day");
    expect(summary).toContain("Car: Car 2");
    expect(summary).not.toContain("secret-token");
  });
});
