import { describe, expect, test } from "bun:test";
import {
  renderEventRegistrationConfirmationEmail,
  type EventRegistrationConfirmation,
} from "./event-registration-confirmation-email";
import { autoReplyDefaults } from "@/lib/notifications/auto-replies";
import { requireAutoReplyDefinition } from "@/lib/notifications/auto-reply-email";
import { EVENT_REGISTRATION_CONFIRMATION_KIND } from "@/lib/notifications/kinds";

const base: EventRegistrationConfirmation = {
  orgName: "Chatter Snow",
  registrantName: "Jo Rivera",
  eventName: "Pride Ride Day",
  // 6pm in Denver, which is the whole point of the zone assertions below.
  startsAt: "2026-03-15T00:00:00.000Z",
  endsAt: null,
  timeZone: "America/Denver",
  location: "Hunter Mountain",
  partySize: 1,
  eventId: "abc123",
  siteUrl: "https://chattersnow.example",
};

describe("renderEventRegistrationConfirmationEmail", () => {
  test("names the event in the subject and the details in both parts", () => {
    const { subject, text, html } =
      renderEventRegistrationConfirmationEmail(base);

    expect(subject).toBe("You're registered for Pride Ride Day");
    for (const part of [text, html]) {
      expect(part).toContain("Jo Rivera");
      expect(part).toContain("Pride Ride Day");
      expect(part).toContain("Hunter Mountain");
      expect(part).toContain("Chatter Snow");
      expect(part).toContain("https://chattersnow.example/events/e/abc123");
    }
  });

  test("reads the start in the event's own zone, with the zone named", () => {
    const { text, html } = renderEventRegistrationConfirmationEmail(base);

    // Asserted piece by piece rather than as one literal: Intl's date/time
    // separator is an ICU detail, not ours ("Mar 14, 2026 at 6:00 PM" on macOS,
    // "Mar 14, 2026, 6:00 PM" on the Linux CI runner), and pinning it makes
    // this test fail on whichever machine it was not written on.
    for (const part of [text, html]) {
      expect(part).toContain("Mar 14, 2026");
      expect(part).toContain("6:00 PM MDT");
    }
  });

  test("labels the event's zone, not the machine's", () => {
    const { text } = renderEventRegistrationConfirmationEmail({
      ...base,
      timeZone: "Pacific/Honolulu",
    });
    expect(text).toContain("2:00 PM HST");
  });

  test("falls back to the rendering zone for an unusable timezone", () => {
    const { text } = renderEventRegistrationConfirmationEmail({
      ...base,
      timeZone: "Not/AZone",
    });
    // formatDateTimeInZone() drops the zone and formats in the process's own,
    // which on a server is UTC -- so the instant is right and the day may read
    // as the next one. Still labelled, so a reader is not left guessing, and
    // still not an exception thrown out of an after() callback. The literal is
    // safe because `bun test` pins the process zone to UTC regardless of the
    // machine's -- the only assertion in this file that depends on that.
    expect(text).toContain("12:00 AM UTC");
    expect(text).not.toContain("Invalid Date");
  });

  test("renders both ends of an event that has one", () => {
    const { text, html } = renderEventRegistrationConfirmationEmail({
      ...base,
      endsAt: "2026-03-15T03:00:00.000Z",
    });
    for (const part of [text, html]) {
      expect(part).toContain("6:00 PM MDT");
      expect(part).toContain("9:00 PM MDT");
    }
  });

  test("says nothing about an end time when the event has none", () => {
    const { text, html } = renderEventRegistrationConfirmationEmail(base);
    for (const part of [text, html]) {
      expect(part).not.toContain(" – ");
    }
  });

  test("leaves out the place when the event has none", () => {
    for (const location of [null, "   "]) {
      const { text, html } = renderEventRegistrationConfirmationEmail({
        ...base,
        location,
      });
      for (const part of [text, html]) {
        expect(part).not.toContain("Where");
      }
    }
  });

  test("counts a party of one as just the registrant", () => {
    const { text } = renderEventRegistrationConfirmationEmail(base);
    expect(text).toContain("Party size: just you");
  });

  test("counts a larger party as a total, the registrant included", () => {
    const { text, html } = renderEventRegistrationConfirmationEmail({
      ...base,
      partySize: 3,
    });
    // party_size is the headcount register_for_event() checks against capacity,
    // so "you plus 3" would be one person too many.
    for (const part of [text, html]) {
      expect(part).toContain("3 people, including you");
    }
  });

  test("echoes the registration choices back, in order (#1407)", () => {
    const { text, html } = renderEventRegistrationConfirmationEmail({
      ...base,
      partySize: 3,
      options: [
        { label: "I need a ticket", quantity: 2 },
        { label: "I need a ticket & gear", quantity: 1 },
      ],
    });
    expect(text).toContain(
      "Your choices: 2 × I need a ticket, 1 × I need a ticket & gear",
    );
    // Escaped in the HTML part like every other value.
    expect(html).toContain("1 × I need a ticket &amp; gear");
  });

  test("an event with no question renders no choices row", () => {
    const { text } = renderEventRegistrationConfirmationEmail(base);
    expect(text).not.toContain("Your choices");
  });

  test("greets someone who gave no name without a dangling space", () => {
    const { text } = renderEventRegistrationConfirmationEmail({
      ...base,
      registrantName: "",
    });
    expect(text).toStartWith("Hi,\n");
  });

  test("carries back neither the phone number nor the notes", () => {
    // There are no such fields on the payload, which is the real guarantee;
    // this is the reminder of why, for anyone about to add one.
    expect(Object.keys(base)).not.toContain("phone");
    expect(Object.keys(base)).not.toContain("notes");
  });

  test("does not double the slash on an origin that has a trailing one", () => {
    const { text, html } = renderEventRegistrationConfirmationEmail({
      ...base,
      siteUrl: "https://chattersnow.example/",
    });
    for (const part of [text, html]) {
      expect(part).toContain("https://chattersnow.example/events/e/abc123");
      expect(part).not.toContain("//events");
    }
  });

  test("escapes what came off the public form and out of the portal", () => {
    const { html } = renderEventRegistrationConfirmationEmail({
      ...base,
      registrantName: "<script>alert(1)</script>",
      location: "<img onerror=alert(1)>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  test("attaches the event as a calendar file naming the event", () => {
    const { attachments } = renderEventRegistrationConfirmationEmail(base);

    expect(attachments).toHaveLength(1);
    const [file] = attachments!;
    expect(file.filename).toBe("event.ics");
    expect(file.contentType).toBe(
      "text/calendar; charset=utf-8; method=PUBLISH",
    );
    expect(file.content).toContain("SUMMARY:Pride Ride Day");
    expect(file.content).toContain("DTSTART:20260315T000000Z");
    // Stable and keyed on the event, so a later reminder updates the entry
    // rather than adding a second copy of the same day.
    expect(file.content).toContain("UID:event-abc123@chattersnow.example");
  });

  test("keeps the calendar uid stable when the origin is unusable", () => {
    const { attachments } = renderEventRegistrationConfirmationEmail({
      ...base,
      siteUrl: "not-a-url",
    });
    expect(attachments![0].content).toContain("UID:event-abc123@");
  });
});

describe("the tenant's own copy (#1234)", () => {
  const definition = requireAutoReplyDefinition(
    EVENT_REGISTRATION_CONFIRMATION_KIND,
  );
  const defaults = autoReplyDefaults(definition);

  test("a rewritten slot changes both parts, and only that slot", () => {
    const { text, html } = renderEventRegistrationConfirmationEmail(base, {
      ...defaults,
      intro: "We saved you a spot at {{event_name}}. Here's what to expect:",
    });

    for (const part of [text, html]) {
      expect(part).toContain("We saved you a spot at Pride Ride Day.");
      expect(part).not.toContain("Here are the details:");
      // Every other slot still ours.
      expect(part).toContain("Hi Jo Rivera,");
      expect(part).toContain("free up your spot");
      expect(part).toContain("— Chatter Snow");
    }
  });

  test("the facts, the link and the attachment survive any copy", () => {
    const blanked = Object.fromEntries(
      Object.keys(defaults).map((key) => [key, ""]),
    ) as typeof defaults;
    const { text, html, attachments } =
      renderEventRegistrationConfirmationEmail(base, blanked);

    for (const part of [text, html]) {
      expect(part).toContain("Pride Ride Day");
      expect(part).toContain("Hunter Mountain");
      expect(part).toContain("https://chattersnow.example/events/e/abc123");
    }
    expect(attachments).toHaveLength(1);
    // A blanked slot leaves nothing behind -- no empty paragraph where a
    // sentence used to be.
    expect(html).not.toContain('<p style="margin: 0 0 8px;"></p>');
    expect(text).not.toContain("\n\n\n");
  });

  test("escapes markup and ampersands once, in the HTML part only", () => {
    const { subject, text, html } = renderEventRegistrationConfirmationEmail(
      {
        ...base,
        orgName: "Ben & Jerry's",
        registrantName: "<script>alert(1)</script>",
        eventName: "Rock & <b>Roll</b> Day",
      },
      {
        ...defaults,
        intro: "Tea & <script>alert(2)</script> at {{event_name}}.",
      },
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("Tea &amp; &lt;script&gt;alert(2)&lt;/script&gt;");
    expect(html).toContain("Rock &amp; &lt;b&gt;Roll&lt;/b&gt; Day");
    expect(html).toContain("Ben &amp; Jerry&#39;s");
    // Escaped once: a reader must never be shown "&amp;" where somebody typed
    // "&", which is what escaping before substitution would produce.
    expect(html).not.toContain("&amp;amp;");
    expect(html).not.toContain("&amp;lt;");

    // The text part and the subject are never escaped.
    expect(text).toContain(
      "Tea & <script>alert(2)</script> at Rock & <b>Roll</b> Day.",
    );
    expect(text).toContain("<script>alert(1)</script>");
    expect(subject).toBe("You're registered for Rock & <b>Roll</b> Day");
  });

  test("keeps a tenant's line breaks in a paragraph slot", () => {
    const { text, html } = renderEventRegistrationConfirmationEmail(base, {
      ...defaults,
      closing: "Bring water.\nBring layers.",
    });
    expect(text).toContain("Bring water.\nBring layers.");
    expect(html).toContain("white-space: pre-line;");
  });
});

/**
 * One end of the threading, pinned where the whole chain is visible: a tenant's
 * branding reaches the shell of a real receipt, and the text part is untouched
 * by it. The shell's own rules are pinned in email-shell.test.ts.
 */
describe("the tenant's shell (#1238)", () => {
  const branded: EventRegistrationConfirmation = {
    ...base,
    branding: {
      logoUrl: "/chatter-logo-transparent.png",
      primary: "#0f766e",
      primaryDeep: "#134e4a",
    },
  };

  test("puts the tenant's logo, resolved against its own origin, at the top", () => {
    const { html } = renderEventRegistrationConfirmationEmail(branded);
    expect(html).toContain(
      'src="https://chattersnow.example/chatter-logo-transparent.png"',
    );
    expect(html).toContain('alt="Chatter Snow"');
  });

  test("links in the tenant's accent rather than the platform's purple", () => {
    const { html } = renderEventRegistrationConfirmationEmail(branded);
    expect(html).toContain("color: #0f766e");
    expect(html).not.toContain("#4c1d95");
  });

  test("leaves the plain-text part byte-identical to the unbranded one", () => {
    expect(renderEventRegistrationConfirmationEmail(branded).text).toBe(
      renderEventRegistrationConfirmationEmail(base).text,
    );
  });

  test("a tenant that has set nothing still gets its name, and no broken image", () => {
    const { html } = renderEventRegistrationConfirmationEmail(base);
    expect(html).not.toContain("<img");
    expect(html).toContain("Chatter Snow");
  });
});
