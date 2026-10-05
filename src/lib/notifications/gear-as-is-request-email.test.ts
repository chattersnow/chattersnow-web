import { describe, expect, test } from "bun:test";
import { renderGearAsIsRequestEmail } from "./gear-as-is-request-email";

const REQUEST = {
  orgName: "Example Org",
  firstName: "Robin",
  itemPlural: "gear",
  url: "https://example.org/acknowledge?t=0123",
  linkDays: 30,
  siteUrl: "https://example.org",
  subject: "About your gear library request: one thing to confirm",
};

describe("renderGearAsIsRequestEmail", () => {
  test("carries the subject, the link and how long it works", () => {
    const email = renderGearAsIsRequestEmail(REQUEST);
    expect(email.subject).toBe(REQUEST.subject);
    expect(email.text).toContain("Hi Robin,");
    expect(email.text).toContain("You asked us for gear");
    expect(email.text).toContain(`Read and confirm: ${REQUEST.url}`);
    expect(email.text).toContain("It works for 30 days.");
    expect(email.html).toContain(`href="${REQUEST.url}"`);
  });

  test("says the link is theirs and repeats nothing about the request", () => {
    const email = renderGearAsIsRequestEmail(REQUEST);
    expect(email.text).toContain("This link is just for you");
    expect(email.text).not.toContain("@");
  });

  test("degrades the greeting without a name", () => {
    const email = renderGearAsIsRequestEmail({ ...REQUEST, firstName: " " });
    expect(email.text).toContain("Hi,");
  });
});
