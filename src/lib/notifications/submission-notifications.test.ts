// The dedupe keys the submission senders claim, which decide whether a second
// send is a duplicate or a deliberate resend. The senders themselves are
// covered against a real database in submission-notifications.integration.test.ts;
// these are the pure functions the portal's resend actions build by hand and
// then hand to recordOutboundMessage(), where a key that did not match what the
// sender claimed would lose the delivery cross-reference.
import { describe, expect, mock, test } from "bun:test";

// The module is `server-only`, which Next's bundler resolves and bun does not.
mock.module("server-only", () => ({}));

const {
  artworkSubmissionConfirmationDedupeKey,
  contactMessageConfirmationDedupeKey,
} = await import("./submission-notifications");

const SUBMISSION_ID = "22222222-2222-4222-8222-222222222222";

describe("artworkSubmissionConfirmationDedupeKey", () => {
  test("is the kind and the submission when nothing is resent", () => {
    expect(artworkSubmissionConfirmationDedupeKey(SUBMISSION_ID)).toBe(
      `artwork_submission_confirmation:${SUBMISSION_ID}`,
    );
  });

  test("carries a resend's suffix, so the second send is not the first's duplicate", () => {
    expect(
      artworkSubmissionConfirmationDedupeKey(
        SUBMISSION_ID,
        "resend:2026-09-16T14:31",
      ),
    ).toBe(
      `artwork_submission_confirmation:${SUBMISSION_ID}:resend:2026-09-16T14:31`,
    );
  });

  test("an empty suffix is the original key, not a trailing colon", () => {
    expect(artworkSubmissionConfirmationDedupeKey(SUBMISSION_ID, "")).toBe(
      artworkSubmissionConfirmationDedupeKey(SUBMISSION_ID),
    );
  });
});

describe("contactMessageConfirmationDedupeKey", () => {
  // Deliberately suffixless: no portal screen resends one, because there is
  // nothing in it worth recovering. Asserted so the artwork change above does
  // not quietly become a convention this one was assumed to follow.
  test("takes no resend suffix", () => {
    expect(contactMessageConfirmationDedupeKey(SUBMISSION_ID)).toBe(
      `contact_message_confirmation:${SUBMISSION_ID}`,
    );
    expect(contactMessageConfirmationDedupeKey.length).toBe(1);
  });
});
