import { describe, expect, test } from "bun:test";
import {
  eventAccessSubject,
  renderEventAccessEmail,
  type EventAccessMessage,
} from "./event-access-email";

const BASE: EventAccessMessage = {
  orgName: "Chatter Snow",
  eventName: "Learn to Ride Day",
  level: "manage",
  areaLabels: ["Details & logistics", "Registrations"],
  grantedBy: "Ada Lovelace",
  url: "https://portal.example.test/portal/events/event-1",
  invite: false,
  siteUrl: "https://example.test",
};

describe("renderEventAccessEmail", () => {
  test("names the event, the areas, the level and who gave it", () => {
    const email = renderEventAccessEmail(BASE);
    expect(email.subject).toBe(
      "Chatter Snow gave you access to Learn to Ride Day",
    );
    expect(email.text).toContain(
      "Ada Lovelace at Chatter Snow gave you access to Learn to Ride Day",
    );
    expect(email.text).toContain("You can view and edit:");
    expect(email.text).toContain("  - Registrations");
    expect(email.text).toContain(`Open Learn to Ride Day: ${BASE.url}`);
    expect(email.html).toContain(`href="${BASE.url}"`);
  });

  test("an invite links to account setup, and a view grant says it can't edit", () => {
    const email = renderEventAccessEmail({
      ...BASE,
      level: "view",
      invite: true,
      grantedBy: null,
      url: "https://example.test/auth/confirm?token_hash=abc&type=invite",
    });
    expect(email.text).toContain(
      "Chatter Snow gave you access to Learn to Ride Day",
    );
    expect(email.text).not.toContain(" at Chatter Snow");
    expect(email.text).toContain("You can view (not edit):");
    expect(email.text).toContain(
      "Set up your account: https://example.test/auth/confirm",
    );
    expect(email.html).toContain("token_hash=abc&amp;type=invite");
  });

  test("escapes the event name in HTML", () => {
    const email = renderEventAccessEmail({
      ...BASE,
      eventName: "<b>Ride</b> & Slide",
    });
    expect(email.html).not.toContain("<b>Ride</b>");
    expect(email.html).toContain("&lt;b&gt;Ride&lt;/b&gt; &amp; Slide");
  });

  test("a blank event name still reads", () => {
    expect(eventAccessSubject("Chatter Snow", " ")).toBe(
      "Chatter Snow gave you access to an event",
    );
  });
});
