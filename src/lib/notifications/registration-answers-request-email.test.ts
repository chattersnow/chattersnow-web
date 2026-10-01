import { describe, expect, test } from "bun:test";
import { renderRegistrationAnswersRequestEmail } from "./registration-answers-request-email";

const REQUEST = {
  orgName: "Example Org",
  firstName: "Robin",
  eventName: "Snow Day",
  intro: "We added a few carpool questions.\nCould you answer them?",
  url: "https://example.org/events/e/abc/answers?t=0123",
  expiresAt: "2026-12-05T23:00:00Z",
  timeZone: "America/Denver",
  siteUrl: "https://example.org",
  subject: "A few questions about Snow Day",
};

describe("renderRegistrationAnswersRequestEmail", () => {
  test("carries the subject, the intro, the link and when it stops working", () => {
    const email = renderRegistrationAnswersRequestEmail(REQUEST);

    expect(email.subject).toBe("A few questions about Snow Day");
    expect(email.text).toContain("Hi Robin,");
    expect(email.text).toContain(REQUEST.intro);
    expect(email.text).toContain(`Answer the questions: ${REQUEST.url}`);
    // In the event's own zone, with the zone named (#1057).
    expect(email.text).toMatch(/Dec 5, 2026.{1,4}4:00 PM MST/);
    expect(email.html).toContain(`href="${REQUEST.url}"`);
    expect(email.html).toContain("white-space: pre-line;");
  });

  test("tells them the link is theirs and repeats nothing else", () => {
    const email = renderRegistrationAnswersRequestEmail(REQUEST);
    expect(email.text).toContain("This link is just for you");
    expect(email.text).not.toContain("@");
  });

  test("escapes what staff typed", () => {
    const email = renderRegistrationAnswersRequestEmail({
      ...REQUEST,
      intro: "Bring <b>snacks</b> & water",
    });
    expect(email.html).toContain("Bring &lt;b&gt;snacks&lt;/b&gt; &amp; water");
  });

  test("a blank first name degrades the greeting", () => {
    const email = renderRegistrationAnswersRequestEmail({
      ...REQUEST,
      firstName: " ",
    });
    expect(email.text.startsWith("Hi,")).toBe(true);
  });
});
