import { describe, expect, test } from "bun:test";
import {
  acknowledgementMethodPhrase,
  acknowledgementPath,
  describeAcknowledgement,
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
