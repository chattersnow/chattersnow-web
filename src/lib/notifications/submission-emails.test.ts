import { describe, expect, test } from "bun:test";
import {
  contactMessageHref,
  renderContactMessageEmail,
  renderVolunteerApplicationEmail,
  volunteerApplicationHref,
} from "./submission-emails";

const SITE_URL = "https://chattersnow.example";

/** The "Label: value" lines of a plain-text part, minus the two link lines. */
function factLabels(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.includes(":") && !line.includes("http"))
    .map((line) => line.split(":")[0]);
}

describe("renderVolunteerApplicationEmail", () => {
  const notice = {
    applicationId: "11111111-2222-4333-8444-555555555555",
    name: "Jo Rivera",
    email: "jo@example.test",
    roleInterest: "Trip lead",
  };

  test("names the applicant in the subject", () => {
    expect(renderVolunteerApplicationEmail(notice, SITE_URL).subject).toBe(
      "New volunteer application: Jo Rivera",
    );
  });

  test("carries who applied and what for, in both parts", () => {
    const { text, html } = renderVolunteerApplicationEmail(notice, SITE_URL);
    for (const part of [text, html]) {
      expect(part).toContain("Jo Rivera");
      expect(part).toContain("jo@example.test");
      expect(part).toContain("Trip lead");
    }
  });

  test("says so rather than leaving a gap when no role was named", () => {
    const { text } = renderVolunteerApplicationEmail(
      { ...notice, roleInterest: null },
      SITE_URL,
    );
    expect(text).toContain("Not specified");
  });

  test("links at the application, not at the list", () => {
    const { text, html } = renderVolunteerApplicationEmail(notice, SITE_URL);
    const url = `${SITE_URL}${volunteerApplicationHref(notice.applicationId)}`;
    expect(url).toBe(
      `${SITE_URL}/portal/volunteers/applications?application=${notice.applicationId}`,
    );
    expect(text).toContain(url);
    expect(html).toContain(`href="${url}"`);
  });

  test("carries none of the submission's own free text", () => {
    // The form also collects availability, phone and pronouns. They are left
    // out on purpose -- the retention purge cannot reach an inbox -- and this
    // is the guard against someone adding them back for convenience.
    const { text } = renderVolunteerApplicationEmail(notice, SITE_URL);
    expect(factLabels(text)).toEqual(["Name", "Email", "Interested in"]);
  });
});

describe("renderContactMessageEmail", () => {
  const notice = {
    messageId: "66666666-7777-4888-8999-aaaaaaaaaaaa",
    name: "Sam Diaz",
    email: "sam@example.test",
    topic: "partnership",
  };

  test("puts the readable topic in the subject, not the raw key", () => {
    expect(renderContactMessageEmail(notice, SITE_URL).subject).toBe(
      "New contact message: Partnerships & sponsorship",
    );
  });

  test("falls back to the raw topic when it is not one we know", () => {
    const { subject } = renderContactMessageEmail(
      { ...notice, topic: "something-else" },
      SITE_URL,
    );
    expect(subject).toBe("New contact message: something-else");
  });

  test("links at the message", () => {
    const { text, html } = renderContactMessageEmail(notice, SITE_URL);
    const url = `${SITE_URL}${contactMessageHref(notice.messageId)}`;
    expect(url).toBe(
      `${SITE_URL}/portal/communications?message=${notice.messageId}`,
    );
    expect(text).toContain(url);
    expect(html).toContain(`href="${url}"`);
  });

  test("says who and what about, and nothing else", () => {
    // A regression guard, not a tautology: the body is the field someone will
    // reach for first when this email feels thin, and it is the one field the
    // retention purge could never take back out of an inbox.
    const { text } = renderContactMessageEmail(notice, SITE_URL);
    expect(factLabels(text)).toEqual(["From", "Email", "Topic"]);
  });
});

describe("untrusted input", () => {
  // Every field in these messages was typed into a public form by an
  // anonymous visitor, so none of it may close a tag or open an anchor.
  test("a name cannot inject markup", () => {
    const { html } = renderVolunteerApplicationEmail(
      {
        applicationId: "a",
        name: '</p><script>alert("x")</script><a href="https://evil.test">',
        email: "jo@example.test",
        roleInterest: null,
      },
      SITE_URL,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="https://evil.test"');
    expect(html).toContain("&lt;script&gt;");
  });

  test("a topic cannot inject markup", () => {
    const { html } = renderContactMessageEmail(
      {
        messageId: "b",
        name: "Sam",
        email: "sam@example.test",
        topic: '"><img src=x onerror=alert(1)>',
      },
      SITE_URL,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  test("an id is escaped into the link", () => {
    const { html } = renderContactMessageEmail(
      {
        messageId: 'x"&y',
        name: "Sam",
        email: "s@example.test",
        topic: "gear",
      },
      SITE_URL,
    );
    expect(html).toContain("/portal/communications?message=x%22%26y");
  });
});

describe("site URL", () => {
  test("a trailing slash does not double up", () => {
    const { text } = renderContactMessageEmail(
      { messageId: "c", name: "Sam", email: "s@example.test", topic: "gear" },
      "https://chattersnow.example///",
    );
    expect(text).toContain("https://chattersnow.example/portal/communications");
    expect(text).not.toContain("example//portal");
  });

  test("points the footer at the account page", () => {
    const { text, html } = renderContactMessageEmail(
      { messageId: "d", name: "Sam", email: "s@example.test", topic: "gear" },
      SITE_URL,
    );
    expect(text).toContain(`${SITE_URL}/portal/account`);
    expect(html).toContain(`${SITE_URL}/portal/account`);
  });
});
