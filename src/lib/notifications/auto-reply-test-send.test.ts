import { describe, expect, mock, test } from "bun:test";
import { NOTIFICATION_KINDS } from "@/lib/notifications/kinds";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";

// The sender is `server-only`, a module that throws outside Next's bundler.
// Nothing here sends anything -- the two functions under test are pure -- so
// the stub is only what makes the import graph loadable.
mock.module("server-only", () => ({}));

const {
  AUTO_REPLY_TEST_KIND,
  AUTO_REPLY_TEST_NOTE,
  AUTO_REPLY_TEST_SUBJECT_PREFIX,
  autoReplyTestDedupeKey,
  markAsTest,
} = await import("@/lib/notifications/auto-reply-test-send");

/**
 * The two properties a test send has to hold, both of them about what it must
 * *not* do (#1236): it must not be mistaken for the real email, and it must
 * not be able to stand in the way of one.
 */

const RENDERED: RenderedEmail = {
  subject: "You're registered for Spring Tune-Up Day",
  text: "Hi Alexandra,\n\nYou're registered.",
  html: '<div style="max-width: 560px;"><p>Hi Alexandra,</p></div>',
  attachments: [
    {
      filename: "event.ics",
      contentType: "text/calendar",
      content: "BEGIN:VCALENDAR",
    },
  ],
};

describe("a test is marked as one", () => {
  const marked = markAsTest(RENDERED);

  test("the subject says so before anything else does", () => {
    expect(marked.subject).toBe(
      `${AUTO_REPLY_TEST_SUBJECT_PREFIX}${RENDERED.subject}`,
    );
  });

  test("both parts carry the note", () => {
    expect(marked.text.startsWith(AUTO_REPLY_TEST_NOTE)).toBe(true);
    expect(marked.html).toContain(AUTO_REPLY_TEST_NOTE);
  });

  test("the email under review is untouched", () => {
    // The banner is prepended as its own block rather than woven in, so what
    // an administrator reads past it is exactly what a member of the public
    // would get.
    expect(marked.text).toContain(RENDERED.text);
    expect(marked.html).toContain(RENDERED.html);
    expect(marked.attachments).toEqual(RENDERED.attachments);
  });
});

describe("a test cannot suppress a real receipt", () => {
  test("it claims the ledger under a kind of its own", () => {
    // The unique constraint is (tenant, person, kind, dedupe_key), so a row
    // under a kind no receipt uses cannot collide with one.
    expect(
      NOTIFICATION_KINDS.some((kind) => kind.key === AUTO_REPLY_TEST_KIND),
    ).toBe(false);
  });

  test("two tests of the same reply get different keys", () => {
    const first = autoReplyTestDedupeKey("event_registration_confirmation");
    const second = autoReplyTestDedupeKey("event_registration_confirmation");
    expect(first).not.toBe(second);
  });

  test("even two in the same millisecond", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    expect(autoReplyTestDedupeKey("gear_request_confirmation", now)).not.toBe(
      autoReplyTestDedupeKey("gear_request_confirmation", now),
    );
  });

  test("the key names the reply and the moment, so the ledger reads", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    expect(
      autoReplyTestDedupeKey("gear_request_confirmation", now),
    ).toStartWith("gear_request_confirmation:2026-09-18T12:00:00.000Z:");
  });
});
