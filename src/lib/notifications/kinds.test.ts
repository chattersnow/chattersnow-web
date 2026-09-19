import { describe, expect, test } from "bun:test";
import {
  ARTWORK_SUBMISSION_CONFIRMATION_KIND,
  CONSTITUENT_NOTIFICATION_KINDS,
  CONTACT_MESSAGE_CONFIRMATION_KIND,
  EVENT_REGISTRATION_CONFIRMATION_KIND,
  GEAR_REQUEST_CONFIRMATION_KIND,
  NOTIFICATION_KINDS,
  VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
  isNotificationKind,
  notificationKindDefault,
  notificationKindEnabled,
} from "./kinds";
import { STAFF_MESSAGE_KIND } from "@/lib/outbound-messages";

describe("the registry", () => {
  test("every kind says who it is for", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(kind.audience).toBeDefined();
    }
  });

  test("a staff kind is opt-in and a constituent kind is opt-out", () => {
    // The invariant the digest and the claim notice rely on: no row means no
    // email, so nothing is ever sent to somebody who did not ask.
    for (const kind of NOTIFICATION_KINDS) {
      expect(notificationKindDefault(kind.key)).toBe(
        kind.audience === "constituent",
      );
    }
  });

  test("a staff kind never reaches /my", () => {
    for (const kind of CONSTITUENT_NOTIFICATION_KINDS) {
      expect(kind.audience).toBe("constituent");
      // A constituent holds no permissions, so a kind gated on one would be a
      // switch that can never change what arrives.
      expect(kind.requires).toBeUndefined();
    }
    expect(CONSTITUENT_NOTIFICATION_KINDS.map((kind) => kind.key)).toEqual([
      GEAR_REQUEST_CONFIRMATION_KIND,
      EVENT_REGISTRATION_CONFIRMATION_KIND,
      VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
      CONTACT_MESSAGE_CONFIRMATION_KIND,
      ARTWORK_SUBMISSION_CONFIRMATION_KIND,
    ]);
  });

  test("every receipt is switchable now that their audience has accounts", () => {
    for (const key of [
      GEAR_REQUEST_CONFIRMATION_KIND,
      EVENT_REGISTRATION_CONFIRMATION_KIND,
      VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
      CONTACT_MESSAGE_CONFIRMATION_KIND,
      ARTWORK_SUBMISSION_CONFIRMATION_KIND,
    ]) {
      expect(isNotificationKind(key)).toBe(true);
    }
  });

  test("a receipt and its staff notice are two different kinds (#1237)", () => {
    // They differ by one word and mean opposite things: the staff notice is
    // opt-in and gated on a permission, the receipt is opt-out and gated on
    // nothing. Spelling one where the other belongs would either mail the
    // queue's notice to a member of the public, or silence a receipt for
    // everybody who never opted in to a queue they hold no role on.
    const pairs: [string, string][] = [
      ["contact_message", CONTACT_MESSAGE_CONFIRMATION_KIND],
      ["artwork_submission", ARTWORK_SUBMISSION_CONFIRMATION_KIND],
      ["volunteer_application", VOLUNTEER_APPLICATION_CONFIRMATION_KIND],
    ];
    for (const [staff, receipt] of pairs) {
      expect(staff).not.toBe(receipt);
      expect(notificationKindDefault(staff)).toBe(false);
      expect(notificationKindDefault(receipt)).toBe(true);
      expect(
        NOTIFICATION_KINDS.find((kind) => kind.key === staff)?.requires,
      ).toBeDefined();
      expect(
        NOTIFICATION_KINDS.find((kind) => kind.key === receipt)?.requires,
      ).toBeUndefined();
    }
  });

  test("a saved row wins over the default, in both directions", () => {
    expect(notificationKindEnabled("task_digest", undefined)).toBe(false);
    expect(notificationKindEnabled("task_digest", true)).toBe(true);
    expect(
      notificationKindEnabled(EVENT_REGISTRATION_CONFIRMATION_KIND, undefined),
    ).toBe(true);
    expect(
      notificationKindEnabled(EVENT_REGISTRATION_CONFIRMATION_KIND, false),
    ).toBe(false);
  });

  test("a key nobody registered is off", () => {
    expect(notificationKindDefault("made_up")).toBe(false);
    expect(isNotificationKind("made_up")).toBe(false);
  });

  test("staff_message is deliberately not a kind (#1203)", () => {
    // Load-bearing absence, not an oversight. hasOptedOut() only consults
    // person_notification_preferences for a registered kind, so leaving this
    // one out is what lets staff answer somebody who switched their receipts
    // off -- a reply about a request you made yourself is correspondence, not
    // a subscription. Registering it here to "finish the set" would silently
    // start suppressing those replies.
    expect(isNotificationKind(STAFF_MESSAGE_KIND)).toBe(false);
    expect(notificationKindDefault(STAFF_MESSAGE_KIND)).toBe(false);
  });
});
