import { describe, expect, test } from "bun:test";
import { checkRegistrationWindow, parseEventRegistrationForm } from "./event-registration-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseEventRegistrationForm", () => {
  test("requires a name", () => {
    expect(parseEventRegistrationForm(formData({ email: "jane@example.com" }))).toEqual({
      error: "Name is required.",
    });
  });

  test("requires a valid email", () => {
    expect(parseEventRegistrationForm(formData({ name: "Jane" }))).toEqual({
      error: "A valid email is required.",
    });
    expect(
      parseEventRegistrationForm(formData({ name: "Jane", email: "not-an-email" }))
    ).toEqual({ error: "A valid email is required." });
  });

  test("defaults party size to 1", () => {
    const result = parseEventRegistrationForm(formData({ name: "Jane", email: "jane@example.com" }));
    expect("data" in result && result.data.party_size).toBe(1);
  });

  test("rejects a party size below 1", () => {
    expect(
      parseEventRegistrationForm(
        formData({ name: "Jane", email: "jane@example.com", partySize: "0" })
      )
    ).toEqual({ error: "Party size must be at least 1." });
  });

  test("rejects a non-integer party size", () => {
    expect(
      parseEventRegistrationForm(
        formData({ name: "Jane", email: "jane@example.com", partySize: "2.5" })
      )
    ).toEqual({ error: "Party size must be at least 1." });
  });

  test("parses valid input", () => {
    const result = parseEventRegistrationForm(
      formData({
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        partySize: "3",
        notes: "Bringing kids",
      })
    );
    expect(result).toEqual({
      data: {
        name: "Jane",
        email: "jane@example.com",
        phone: "555-1234",
        party_size: 3,
        notes: "Bringing kids",
      },
    });
  });
});

describe("checkRegistrationWindow", () => {
  test("rejects when registration is not enabled", () => {
    expect(checkRegistrationWindow({ registration_enabled: false, registration_deadline: null })).toEqual({
      open: false,
      reason: "Registration is not open for this event.",
    });
  });

  test("rejects once the deadline has passed", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    expect(
      checkRegistrationWindow(
        { registration_enabled: true, registration_deadline: "2026-08-22T00:00:00Z" },
        now
      )
    ).toEqual({ open: false, reason: "The registration deadline for this event has passed." });
  });

  test("is open when enabled with no deadline", () => {
    expect(checkRegistrationWindow({ registration_enabled: true, registration_deadline: null })).toEqual({
      open: true,
    });
  });

  test("is open before the deadline", () => {
    const now = new Date("2026-08-23T00:00:00Z");
    expect(
      checkRegistrationWindow(
        { registration_enabled: true, registration_deadline: "2026-08-24T00:00:00Z" },
        now
      )
    ).toEqual({ open: true });
  });
});
