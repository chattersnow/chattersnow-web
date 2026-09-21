// #1317: who an announcement reaches, and what the composer says about it
// before anybody commits to the send. Everything here is the pure half the
// dialog and the Server Action both run -- the dialog so the count is honest,
// the action so it is safe -- so a disagreement between them is a bug this
// file is meant to catch.
import { describe, expect, test } from "bun:test";
import {
  ANNOUNCEMENT_ERRORS,
  announcementBatches,
  announcementRefusal,
  describeAnnouncementAudience,
  eventAnnouncementDedupeKey,
  isAnnouncementAudience,
  MAX_ANNOUNCEMENT_RECIPIENTS,
  resolveAnnouncementAudience,
  type AudienceRegistration,
} from "./event-announcements";
import {
  EVENT_ANNOUNCEMENT_KIND,
  type RecordMessages,
  type RecordMessageRow,
} from "./outbound-messages";

function registration(
  overrides: Partial<AudienceRegistration> & { id: string },
): AudienceRegistration {
  return {
    name: "Jamie Rivera",
    email: `${overrides.id}@example.test`,
    person_id: `person-${overrides.id}`,
    checked_in_at: null,
    ...overrides,
  };
}

const CHECKED_IN = registration({
  id: "in",
  checked_in_at: "2026-09-20T09:00:00.000Z",
});
const NOT_CHECKED_IN = registration({ id: "out" });

describe("resolveAnnouncementAudience", () => {
  test("splits the list on the check-in ledger", () => {
    const rows = [CHECKED_IN, NOT_CHECKED_IN];

    expect(
      resolveAnnouncementAudience(rows, "everyone").recipients,
    ).toHaveLength(2);
    expect(
      resolveAnnouncementAudience(rows, "checked_in").recipients.map(
        (recipient) => recipient.registrationId,
      ),
    ).toEqual(["in"]);
    expect(
      resolveAnnouncementAudience(rows, "not_checked_in").recipients.map(
        (recipient) => recipient.registrationId,
      ),
    ).toEqual(["out"]);
  });

  test("excludes a registration with nobody to write to, and counts it", () => {
    // Both shapes: what the retention purge leaves behind (rule C blanks the
    // address in place), and a staff-added walk-in who never had one.
    const resolved = resolveAnnouncementAudience(
      [
        registration({ id: "keeps", email: "keeps@example.test" }),
        registration({ id: "purged", email: "", person_id: null }),
        registration({ id: "walkin", email: null }),
        registration({ id: "spaces", email: "   " }),
      ],
      "everyone",
    );

    expect(resolved.recipients.map((r) => r.registrationId)).toEqual(["keeps"]);
    expect(resolved.withoutAddress).toBe(3);
  });

  test("somebody who registered twice gets one copy", () => {
    const resolved = resolveAnnouncementAudience(
      [
        registration({ id: "first", email: "Sam@Example.test" }),
        registration({ id: "second", email: "  sam@example.TEST  " }),
        registration({ id: "other", email: "other@example.test" }),
      ],
      "everyone",
    );

    // The first registration wins, because its id is what the dedupe key and
    // the history row are built from -- the announcement has to land on a row.
    expect(resolved.recipients.map((r) => r.registrationId)).toEqual([
      "first",
      "other",
    ]);
    // Trimmed, not lower-cased: the address is sent as the person typed it.
    expect(resolved.recipients[0].email).toBe("Sam@Example.test");
    expect(resolved.duplicates).toBe(1);
  });

  test("a null person_id is a recipient, not a problem", () => {
    const resolved = resolveAnnouncementAudience(
      [registration({ id: "unlinked", person_id: null })],
      "everyone",
    );
    expect(resolved.recipients[0].personId).toBeNull();
  });
});

describe("describeAnnouncementAudience", () => {
  test("leads with the number of emails and accounts for the rest", () => {
    expect(
      describeAnnouncementAudience(
        resolveAnnouncementAudience(
          [
            registration({ id: "a" }),
            registration({ id: "b" }),
            registration({ id: "c", email: "" }),
          ],
          "everyone",
        ),
      ),
    ).toBe("This will email 2 people; 1 registration has no address.");
  });

  test("counts one person as a person", () => {
    expect(
      describeAnnouncementAudience(
        resolveAnnouncementAudience([registration({ id: "a" })], "everyone"),
      ),
    ).toBe("This will email 1 person.");
  });

  test("names a collapsed duplicate, so the count can be reconciled", () => {
    expect(
      describeAnnouncementAudience(
        resolveAnnouncementAudience(
          [
            registration({ id: "a", email: "same@example.test" }),
            registration({ id: "b", email: "same@example.test" }),
          ],
          "everyone",
        ),
      ),
    ).toBe("This will email 1 person; 1 duplicate address was collapsed.");
  });

  test("says so when there is nobody", () => {
    expect(
      describeAnnouncementAudience(resolveAnnouncementAudience([], "everyone")),
    ).toBe("This will email nobody.");
  });
});

describe("announcementRefusal", () => {
  test("nothing to send to", () => {
    expect(
      announcementRefusal(resolveAnnouncementAudience([], "everyone")),
    ).toBe(ANNOUNCEMENT_ERRORS.NO_RECIPIENTS);
  });

  test("the cap is named in the refusal, and one under it is allowed", () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        registration({ id: `r${index}` }),
      );

    expect(
      announcementRefusal(
        resolveAnnouncementAudience(
          rows(MAX_ANNOUNCEMENT_RECIPIENTS),
          "everyone",
        ),
      ),
    ).toBeUndefined();

    const refusal = announcementRefusal(
      resolveAnnouncementAudience(
        rows(MAX_ANNOUNCEMENT_RECIPIENTS + 1),
        "everyone",
      ),
    );
    expect(refusal).toBe(ANNOUNCEMENT_ERRORS.TOO_MANY);
    expect(refusal).toContain(String(MAX_ANNOUNCEMENT_RECIPIENTS));
  });

  test("the cap counts recipients, not registrations", () => {
    // Fifty-one registrations, one of them a duplicate address and one with no
    // address at all, is fifty emails -- and the cap is about emails.
    const rows = [
      ...Array.from({ length: 49 }, (_, index) =>
        registration({ id: `r${index}` }),
      ),
      registration({ id: "dup", email: "r0@example.test" }),
      registration({ id: "blank", email: "" }),
      registration({ id: "last" }),
    ];
    expect(
      announcementRefusal(resolveAnnouncementAudience(rows, "everyone")),
    ).toBeUndefined();
  });
});

describe("isAnnouncementAudience", () => {
  test("only the three the composer offers", () => {
    expect(isAnnouncementAudience("everyone")).toBe(true);
    expect(isAnnouncementAudience("checked_in")).toBe(true);
    expect(isAnnouncementAudience("not_checked_in")).toBe(true);
    expect(isAnnouncementAudience("all_people")).toBe(false);
    expect(isAnnouncementAudience(undefined)).toBe(false);
  });
});

describe("eventAnnouncementDedupeKey", () => {
  test("carries the registration id, so a delivery is findable from the record", () => {
    const key = eventAnnouncementDedupeKey("reg-1", "batch-1");
    expect(key).toBe(`${EVENT_ANNOUNCEMENT_KIND}:reg-1:batch-1`);
    // The Email Delivery log filters dedupe_key with an ilike on the record id
    // (#1310); a key that named only the batch would make a send unfindable
    // from the registration it is about.
    expect(key).toContain("reg-1");
  });

  test("two recipients of one announcement claim different rows", () => {
    expect(eventAnnouncementDedupeKey("reg-1", "batch-1")).not.toBe(
      eventAnnouncementDedupeKey("reg-2", "batch-1"),
    );
  });
});

describe("announcementBatches", () => {
  function row(overrides: Partial<RecordMessageRow>): RecordMessageRow {
    return {
      id: crypto.randomUUID(),
      subject: "Road closed",
      kind: EVENT_ANNOUNCEMENT_KIND,
      status: "sent",
      created_at: "2026-09-20T10:00:00.000Z",
      sent_by: "user-1",
      batch_id: "batch-1",
      ...overrides,
    };
  }

  function messages(
    byRecord: Record<string, RecordMessageRow[]>,
  ): RecordMessages {
    return { byRecord, actors: [] };
  }

  test("groups every copy into one line, and tallies the outcomes", () => {
    const batches = announcementBatches(
      messages({
        "reg-1": [row({})],
        "reg-2": [row({ status: "failed" })],
        "reg-3": [row({})],
      }),
    );

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      batchId: "batch-1",
      subject: "Road closed",
      sentBy: "user-1",
      sent: 2,
      failed: 1,
    });
  });

  test("a one-to-one message is not an announcement", () => {
    expect(
      announcementBatches(
        messages({
          "reg-1": [row({ kind: "staff_message", batch_id: null })],
        }),
      ),
    ).toEqual([]);
  });

  test("the batch's time is its first copy's, not its last", () => {
    // The send loop writes one row per recipient over several seconds, so the
    // newest row is not when the announcement went out.
    const batches = announcementBatches(
      messages({
        "reg-1": [row({ created_at: "2026-09-20T10:00:30.000Z" })],
        "reg-2": [row({ created_at: "2026-09-20T10:00:00.000Z" })],
      }),
    );
    expect(batches[0].sentAt).toBe("2026-09-20T10:00:00.000Z");
  });

  test("newest announcement first", () => {
    const batches = announcementBatches(
      messages({
        "reg-1": [
          row({ batch_id: "older", created_at: "2026-09-18T10:00:00.000Z" }),
          row({ batch_id: "newer", created_at: "2026-09-20T10:00:00.000Z" }),
        ],
      }),
    );
    expect(batches.map((batch) => batch.batchId)).toEqual(["newer", "older"]);
  });
});
