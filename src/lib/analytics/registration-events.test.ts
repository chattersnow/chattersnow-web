import { afterEach, describe, expect, test } from "bun:test";
import {
  setRegistrationCapture,
  trackRegistration,
} from "@/lib/analytics/registration-events";

function recorder() {
  const calls: [string, Record<string, string>][] = [];
  setRegistrationCapture((event, properties) => {
    calls.push([event, properties]);
  });
  return calls;
}

afterEach(() => setRegistrationCapture(null));

describe("trackRegistration", () => {
  test("does nothing until a capture is set", () => {
    expect(() =>
      trackRegistration("registration_opened", { event_id: "e1" }),
    ).not.toThrow();
  });

  test("sends the event with its allowed properties", () => {
    const calls = recorder();
    trackRegistration("registration_failed", {
      event_id: "e1",
      step: "review",
      error_code: "EVENT_AT_CAPACITY",
    });
    expect(calls).toEqual([
      [
        "registration_failed",
        { event_id: "e1", step: "review", error_code: "EVENT_AT_CAPACITY" },
      ],
    ]);
  });

  test("drops anything outside the allowlist that gets past the types", () => {
    const calls = recorder();
    const sneaky = { event_id: "e1", email: "someone@example.org" };
    trackRegistration("registration_completed", sneaky);
    expect(calls).toEqual([["registration_completed", { event_id: "e1" }]]);
  });

  test("an unknown property in a literal is a type error", () => {
    recorder();
    trackRegistration("registration_opened", {
      event_id: "e1",
      // @ts-expect-error -- not on the allowlist
      name: "Someone",
    });
    trackRegistration("registration_step_viewed", {
      event_id: "e1",
      // @ts-expect-error -- not a registration step
      step: "payment",
    });
    // @ts-expect-error -- not a registration event
    trackRegistration("registration_abandoned", { event_id: "e1" });
  });
});
