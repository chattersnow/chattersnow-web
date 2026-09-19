import { describe, expect, test } from "bun:test";
import {
  renderContactMessageConfirmationEmail,
  type ContactMessageConfirmation,
} from "./contact-message-confirmation-email";
import { autoReplyDefaults } from "@/lib/notifications/auto-replies";
import { requireAutoReplyDefinition } from "@/lib/notifications/auto-reply-email";
import { CONTACT_MESSAGE_CONFIRMATION_KIND } from "@/lib/notifications/kinds";

const base: ContactMessageConfirmation = {
  orgName: "Chatter Snow",
  senderName: "Jo Rivera",
  topicLabel: "General inquiry",
  // 21:30 UTC is the previous evening in Denver, which is the point: the date
  // below is the organization's, not the server's.
  receivedAt: "2026-03-14T21:30:00.000Z",
  timeZone: "America/Denver",
};

describe("renderContactMessageConfirmationEmail", () => {
  test("says what it was about and when it landed, in both parts", () => {
    const { subject, text, html } = renderContactMessageConfirmationEmail(base);

    expect(subject).toBe("We got your message — Chatter Snow");
    for (const part of [text, html]) {
      expect(part).toContain("Jo Rivera");
      expect(part).toContain("General inquiry");
      expect(part).toContain("March 14, 2026");
      expect(part).toContain("Chatter Snow");
    }
  });

  test("reads the date in the organization's zone, not the server's", () => {
    // 21:30 UTC on the 14th is 15:30 on the 14th in Denver and 07:30 on the
    // 15th in Auckland. An email has no browser to ask, so the zone has to be
    // chosen, and the organization's is the one its own staff would name.
    const { text } = renderContactMessageConfirmationEmail({
      ...base,
      timeZone: "Pacific/Auckland",
    });
    expect(text).toContain("March 15, 2026");
  });

  test("falls back rather than throwing on a zone nobody recognises", () => {
    const { text } = renderContactMessageConfirmationEmail({
      ...base,
      timeZone: "Middle/Earth",
    });
    expect(text).toContain("2026");
  });

  test("greets somebody who gave no name without a dangling space", () => {
    const { text } = renderContactMessageConfirmationEmail({
      ...base,
      senderName: "",
    });
    expect(text).toStartWith("Hi,\n");
  });

  test("carries back neither the message body nor a phone number", () => {
    // There are no such fields on the payload, which is the real guarantee:
    // run_retention_purge hard-deletes contact_messages on a schedule, and an
    // inbox is somewhere that clock cannot reach.
    expect(Object.keys(base)).not.toContain("message");
    expect(Object.keys(base)).not.toContain("body");
    expect(Object.keys(base)).not.toContain("phone");
  });

  test("leaves the topic row out rather than rendering an empty one", () => {
    const { text, html } = renderContactMessageConfirmationEmail({
      ...base,
      topicLabel: "   ",
    });
    for (const part of [text, html]) {
      expect(part).not.toContain("Topic");
      expect(part).toContain("Received");
    }
  });

  test("escapes what came off the public form", () => {
    const { html } = renderContactMessageConfirmationEmail({
      ...base,
      senderName: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("the tenant's own copy (#1233)", () => {
  const definition = requireAutoReplyDefinition(
    CONTACT_MESSAGE_CONFIRMATION_KIND,
  );
  const defaults = autoReplyDefaults(definition);

  test("a rewritten slot changes both parts, and only that slot", () => {
    const { subject, text, html } = renderContactMessageConfirmationEmail(
      base,
      {
        ...defaults,
        subject: "Thanks for writing, {{first_name}}",
        intro: "One of us reads these every morning. Here's what you sent:",
      },
    );

    expect(subject).toBe("Thanks for writing, Jo Rivera");
    for (const part of [text, html]) {
      expect(part).toContain("every morning");
      expect(part).not.toContain("Thanks for getting in touch.");
      expect(part).toContain("Hi Jo Rivera,");
      expect(part).toContain("— Chatter Snow");
    }
  });

  test("the topic and the date survive any copy", () => {
    const blanked = Object.fromEntries(
      Object.keys(defaults).map((key) => [key, ""]),
    ) as typeof defaults;
    const { text, html } = renderContactMessageConfirmationEmail(base, blanked);

    for (const part of [text, html]) {
      expect(part).toContain("General inquiry");
      expect(part).toContain("March 14, 2026");
    }
    // A blanked slot disappears rather than leaving a gap where a sentence was.
    expect(text).not.toContain("\n\n\n");
  });

  test("escapes markup and ampersands once, in the HTML part only", () => {
    const { text, html } = renderContactMessageConfirmationEmail(
      {
        ...base,
        orgName: "Ben & Jerry's",
        senderName: "<script>alert(1)</script>",
      },
      { ...defaults, closing: "Tea & <b>cake</b> on arrival." },
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("Tea &amp; &lt;b&gt;cake&lt;/b&gt; on arrival.");
    expect(html).toContain("Ben &amp; Jerry&#39;s");
    expect(html).not.toContain("&amp;amp;");
    expect(text).toContain("Tea & <b>cake</b> on arrival.");
    expect(text).toContain("<script>alert(1)</script>");
  });
});
