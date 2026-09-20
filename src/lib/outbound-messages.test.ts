import { describe, expect, test } from "bun:test";
import {
  EVENT_ANNOUNCEMENT_KIND,
  MAX_MESSAGE_BODY_LENGTH,
  MAX_MESSAGE_SUBJECT_LENGTH,
  STAFF_MESSAGE_KIND,
  outboundMessageSenderLabel,
  outboundMessageStatusLabel,
  outboundMessageStatusTone,
  resendDedupeSuffix,
} from "@/lib/outbound-messages";

describe("the caps", () => {
  // These are the check constraints on outbound_messages
  // (20260916130000_create_outbound_messages.sql). The composer counts against
  // them and the action refuses past them, so a change here that is not made
  // there turns a typed sentence into a 23514 at send time.
  test("match the column constraints", () => {
    expect(MAX_MESSAGE_SUBJECT_LENGTH).toBe(200);
    expect(MAX_MESSAGE_BODY_LENGTH).toBe(5000);
  });
});

describe("the status", () => {
  test("reads as sent or not sent, and nothing in between", () => {
    expect(outboundMessageStatusLabel("sent")).toBe("Sent");
    expect(outboundMessageStatusLabel("failed")).toBe("Not sent");
  });

  test("is toned so a failure is not mistaken for a success", () => {
    expect(outboundMessageStatusTone("sent")).toBe("success");
    expect(outboundMessageStatusTone("failed")).toBe("danger");
  });
});

describe("resendDedupeSuffix", () => {
  test("is stable within a minute and changes across one", () => {
    const at = new Date("2026-09-16T14:31:05.000Z");
    const sameMinute = new Date("2026-09-16T14:31:59.000Z");
    const nextMinute = new Date("2026-09-16T14:32:00.000Z");

    expect(resendDedupeSuffix(at)).toBe("resend:2026-09-16T14:31");
    expect(resendDedupeSuffix(sameMinute)).toBe(resendDedupeSuffix(at));
    expect(resendDedupeSuffix(nextMinute)).not.toBe(resendDedupeSuffix(at));
  });
});

describe("the kind", () => {
  test("is the one the sender claims", () => {
    expect(STAFF_MESSAGE_KIND).toBe("staff_message");
  });

  test("an announcement is its own kind, not a batch of staff messages (#1317)", () => {
    // Kept apart so a consent or unsubscribe story can attach to a notice
    // posted to a list without touching correspondence somebody asked for.
    expect(EVENT_ANNOUNCEMENT_KIND).toBe("event_announcement");
    expect(EVENT_ANNOUNCEMENT_KIND).not.toBe(STAFF_MESSAGE_KIND);
  });
});

describe("outboundMessageSenderLabel", () => {
  // Three kinds reach a history card and they are not interchangeable: a
  // message somebody wrote, a notice posted to everybody registered, and a
  // receipt the organization wrote that a staffer only re-sent. Before #1317
  // this was a two-way branch, so an announcement would have read "Receipt,
  // resent by ..." -- which is the one thing it is not.
  test("tells a message, an announcement and a resent receipt apart", () => {
    expect(outboundMessageSenderLabel(STAFF_MESSAGE_KIND, "Dana Reyes")).toBe(
      "Sent by Dana Reyes",
    );
    expect(
      outboundMessageSenderLabel(EVENT_ANNOUNCEMENT_KIND, "Dana Reyes"),
    ).toBe("Announcement, sent by Dana Reyes");
    expect(
      outboundMessageSenderLabel(
        "event_registration_confirmation",
        "Dana Reyes",
      ),
    ).toBe("Receipt, resent by Dana Reyes");
  });
});
