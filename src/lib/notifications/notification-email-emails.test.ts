import { describe, expect, test } from "bun:test";
import {
  confirmNotificationEmailHref,
  renderNotificationEmailChanged,
  renderNotificationEmailConfirmation,
} from "./notification-email-emails";

const TOKEN = "a".repeat(64);

describe("renderNotificationEmailConfirmation", () => {
  const email = renderNotificationEmailConfirmation({
    orgName: "Example Nonprofit",
    personName: "Avery Morgan",
    token: TOKEN,
    expiresAt: new Date("2026-09-15T12:00:00Z"),
    siteUrl: "https://example.test/",
  });

  test("carries the link, with the trailing slash normalized away", () => {
    const url = `https://example.test${confirmNotificationEmailHref(TOKEN)}`;
    expect(email.text).toContain(url);
    expect(email.html).toContain(url);
  });

  test("says who asked and when the link dies", () => {
    expect(email.text).toContain("Avery Morgan");
    expect(email.text).toContain("September 15, 2026");
  });

  // The address has not been proved yet, so the message goes to somebody who
  // may have no idea what this is. It must say nothing about the organization's
  // work, and must offer doing nothing as a real option.
  test("tells a stranger they can ignore it", () => {
    expect(email.text).toContain("ignore this message");
  });

  test("escapes a name that would otherwise close a tag", () => {
    const nasty = renderNotificationEmailConfirmation({
      orgName: "Example Nonprofit",
      personName: '<script>alert("x")</script>',
      token: TOKEN,
      expiresAt: new Date("2026-09-15T12:00:00Z"),
      siteUrl: "https://example.test",
    });
    expect(nasty.html).not.toContain("<script>");
    expect(nasty.html).toContain("&lt;script&gt;");
  });
});

describe("renderNotificationEmailChanged", () => {
  const email = renderNotificationEmailChanged({
    orgName: "Example Nonprofit",
    confirmedEmail: "ops@chattersnow.test",
    siteUrl: "https://example.test",
  });

  test("names where mail is going now", () => {
    expect(email.text).toContain("ops@chattersnow.test");
  });

  // The reason this message exists: it is what a person who did not ask for
  // the change would act on.
  test("says what to do if this was not you", () => {
    expect(email.text).toContain("did not ask");
    expect(email.text).toContain("https://example.test/portal/account");
  });
});
