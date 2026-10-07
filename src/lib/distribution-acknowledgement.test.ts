import { describe, expect, test } from "bun:test";
import {
  acknowledgementMethodPhrase,
  acknowledgementPath,
  describeAcknowledgement,
  emailLinkUnavailableReason,
  handoutAsIsRequestSubject,
  isSkippedReason,
  toAcknowledgementView,
} from "./distribution-acknowledgement";

const NONE = {
  acknowledgedAt: null,
  typedName: null,
  method: null,
  skippedReason: null,
  skippedNote: null,
};

describe("describeAcknowledgement", () => {
  test("names who acknowledged and how", () => {
    expect(
      describeAcknowledgement({
        ...NONE,
        acknowledgedAt: "2026-10-05T12:00:00Z",
        typedName: "Robin Example",
        method: "own_device",
      }),
    ).toBe("Acknowledged as-is by Robin Example on their own phone");
  });

  test("an emailed link after a reason keeps the reason", () => {
    expect(
      describeAcknowledgement({
        ...NONE,
        acknowledgedAt: "2026-10-06T12:00:00Z",
        typedName: "Robin Example",
        method: "emailed_link",
        skippedReason: "left_before_acknowledging",
      }),
    ).toBe(
      "Acknowledged as-is by Robin Example by emailed link afterwards (at the handout: left before acknowledging)",
    );
  });

  test("survives a name cleared by retention", () => {
    expect(
      describeAcknowledgement({
        ...NONE,
        acknowledgedAt: "2026-10-05T12:00:00Z",
        method: "gear_request",
      }),
    ).toBe("Acknowledged as-is on their request");
  });

  test("gives the reason there is none, with its note", () => {
    expect(
      describeAcknowledgement({
        ...NONE,
        skippedReason: "other",
        skippedNote: "Picked up by a parent",
      }),
    ).toBe("Not acknowledged: other — Picked up by a parent");
    expect(
      describeAcknowledgement({ ...NONE, skippedReason: "no_phone" }),
    ).toBe("Not acknowledged: no phone");
  });

  test("says nothing for a movement with neither", () => {
    expect(describeAcknowledgement(NONE)).toBeNull();
  });
});

describe("the rest", () => {
  test("an unknown method reads as nothing, not a raw key", () => {
    expect(acknowledgementMethodPhrase("carrier_pigeon")).toBe("");
    expect(acknowledgementMethodPhrase(null)).toBe("");
  });

  test("only the four reasons are reasons", () => {
    expect(isSkippedReason("declined_to_wait")).toBe(true);
    expect(isSkippedReason("bored")).toBe(false);
    expect(isSkippedReason(undefined)).toBe(false);
  });

  test("the token rides in the query string, encoded", () => {
    expect(acknowledgementPath("a+b/c")).toBe("/acknowledge?t=a%2Bb%2Fc");
  });

  test("the page view tolerates missing fields", () => {
    expect(toAcknowledgementView(null)).toEqual({
      kind: "handout",
      firstName: null,
      eventName: null,
      items: [],
    });
  });

  test("a gear request's link reads as one", () => {
    expect(toAcknowledgementView({ kind: "gear_request" }).kind).toBe(
      "gear_request",
    );
  });
});

describe("the emailed link (#1519)", () => {
  test("a handout link's view keeps its kind", () => {
    expect(toAcknowledgementView({ kind: "handout_link" }).kind).toBe(
      "handout_link",
    );
    expect(toAcknowledgementView({ kind: "anything" }).kind).toBe("handout");
  });

  test("says why no link can be offered", () => {
    expect(emailLinkUnavailableReason("available", null)).toContain("Pick");
    expect(emailLinkUnavailableReason("available", { email: " " })).toContain(
      "no email address",
    );
    expect(
      emailLinkUnavailableReason("email_off", { email: "r@example.com" }),
    ).toContain("email is off");
    expect(
      emailLinkUnavailableReason("no_public_site", { email: "r@example.com" }),
    ).toContain("no public site");
    expect(
      emailLinkUnavailableReason("available", { email: "r@example.com" }),
    ).toBeNull();
  });

  test("the subject names what they picked up", () => {
    expect(handoutAsIsRequestSubject("Gear")).toBe(
      "About the gear you picked up: one thing to confirm",
    );
    expect(handoutAsIsRequestSubject(" ")).toBe(
      "About the items you picked up: one thing to confirm",
    );
  });
});
