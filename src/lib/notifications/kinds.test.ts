import { describe, expect, test } from "bun:test";
import {
  CONSTITUENT_NOTIFICATION_KINDS,
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
    ]);
  });

  test("the three receipts are switchable now that their audience has accounts", () => {
    for (const key of [
      GEAR_REQUEST_CONFIRMATION_KIND,
      EVENT_REGISTRATION_CONFIRMATION_KIND,
      VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
    ]) {
      expect(isNotificationKind(key)).toBe(true);
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
