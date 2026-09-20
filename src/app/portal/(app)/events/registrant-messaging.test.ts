// #1317: what a message to a registrant is called in their own inbox. The
// subject is the only part of these sends the recipient sees before deciding
// whether to open it, and it is built from two values either of which can be
// missing -- so the shape it degrades to is the thing worth pinning down.
import { describe, expect, test } from "bun:test";
import {
  announcementSubject,
  registrantMessageSubject,
  REGISTRANT_MESSAGE_ERRORS,
} from "./registrant-messaging";

describe("registrantMessageSubject", () => {
  test("names the event, then the organization", () => {
    expect(registrantMessageSubject("Mountain Day", "Chatter Snow")).toBe(
      "About Mountain Day — Chatter Snow",
    );
  });

  test("each part drops out cleanly rather than leaving a dangling dash", () => {
    expect(registrantMessageSubject("Mountain Day", "")).toBe(
      "About Mountain Day",
    );
    expect(registrantMessageSubject("", "Chatter Snow")).toBe(
      "About your registration — Chatter Snow",
    );
    expect(registrantMessageSubject("   ", "   ")).toBe(
      "About your registration",
    );
  });
});

describe("announcementSubject", () => {
  test("starts as the event's own name", () => {
    // Not "About <event>": an announcement is about the event by definition,
    // and the name alone is what a registrant scanning an inbox recognises.
    expect(announcementSubject("Mountain Day")).toBe("Mountain Day");
  });

  test("falls back rather than sending an empty subject", () => {
    expect(announcementSubject("  ")).toBe("An update about your registration");
  });
});

describe("the refusals", () => {
  test("one sentence covers both shapes of a registration with no address", () => {
    // Retention blanks the address in place and a staff-added walk-in may
    // never have had one. The organizer does not need to know which; they need
    // to know there is nobody to write to.
    expect(REGISTRANT_MESSAGE_ERRORS.NO_EMAIL).toBe(
      "This registration has no email address to write to.",
    );
  });
});
