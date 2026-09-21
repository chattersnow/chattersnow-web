import { describe, expect, test } from "bun:test";
import {
  legalAcknowledgementSettingKey,
  needsAcknowledgement,
  parseLegalAcknowledgement,
  resolveLegalAcknowledgement,
  LEGAL_ACKNOWLEDGEMENT_PREFIX,
} from "@/lib/legal-acknowledgement";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import { RESERVED_NAMESPACES } from "@/lib/public-namespaces";

const RECORD = {
  person_id: "11111111-1111-1111-1111-111111111111",
  person_name: "Dana Whitfield",
  acknowledged_at: "2026-03-04T12:00:00Z",
  platform_last_updated: "March 1, 2026",
};

describe("where a confirmation is stored", () => {
  test("one prefixed key per document, like every neighbour", () => {
    expect(legalAcknowledgementSettingKey("privacy")).toBe(
      "legal_acknowledged.privacy",
    );
  });

  // Who here has read their own privacy policy is nobody else's business, and
  // the reserved prefixes are world-readable by construction (#888): a row
  // under one of them reaches `anon` the moment it exists, with no migration
  // and no signal. This is the test that keeps it out of them.
  test("is not a namespace any public view serves", () => {
    for (const namespace of RESERVED_NAMESPACES) {
      expect(
        LEGAL_ACKNOWLEDGEMENT_PREFIX.startsWith(namespace.prefix),
      ).toBeFalse();
    }
  });
});

describe("reading a stored value back", () => {
  test("keeps the actor, the moment and the version read", () => {
    expect(parseLegalAcknowledgement(RECORD)).toEqual({
      personId: "11111111-1111-1111-1111-111111111111",
      personName: "Dana Whitfield",
      acknowledgedAt: "2026-03-04T12:00:00Z",
      platformLastUpdated: "March 1, 2026",
    });
  });

  // The field the whole comparison turns on. A record without it could only
  // report as permanently stale or permanently current, depending on which way
  // the comparison happened to fall, so it is not a record at all.
  test("a value with no version read is not a confirmation", () => {
    expect(
      parseLegalAcknowledgement({ ...RECORD, platform_last_updated: null }),
    ).toBeNull();
    expect(
      parseLegalAcknowledgement({ ...RECORD, platform_last_updated: "" }),
    ).toBeNull();
  });

  test("a missing, wrongly shaped or hand-typed row is not a confirmation", () => {
    expect(parseLegalAcknowledgement(null)).toBeNull();
    expect(parseLegalAcknowledgement(true)).toBeNull();
    expect(parseLegalAcknowledgement("March 1, 2026")).toBeNull();
    expect(parseLegalAcknowledgement([RECORD])).toBeNull();
  });

  // A service-role script or a seed can write this row, and a person who has
  // no `people` row yet reaches the action through the portal. The date is
  // still the answer; the name simply goes unsaid.
  test("survives an actor it cannot name", () => {
    expect(
      parseLegalAcknowledgement({
        ...RECORD,
        person_id: null,
        person_name: "   ",
      }),
    ).toMatchObject({ personId: null, personName: null });
  });
});

describe("comparing it against the text being served", () => {
  const record = parseLegalAcknowledgement(RECORD)!;

  test("nothing stored means nobody here has confirmed it", () => {
    expect(resolveLegalAcknowledgement(null, "March 1, 2026")).toEqual({
      status: "never",
    });
  });

  test("the same version is a settled confirmation", () => {
    expect(resolveLegalAcknowledgement(record, "March 1, 2026")).toEqual({
      status: "confirmed",
      confirmed: record,
    });
  });

  test("a version that has moved is stale, and says what it moved to", () => {
    expect(resolveLegalAcknowledgement(record, "September 21, 2026")).toEqual({
      status: "stale",
      confirmed: record,
      updatedTo: "September 21, 2026",
    });
  });

  // Compared as an exact string rather than as a date: the constant is a
  // version key, and a text edited to a value that happens to sort earlier
  // still means the words moved under the organization.
  test("a version that moved backwards is still stale", () => {
    expect(
      resolveLegalAcknowledgement(record, "January 1, 2026"),
    ).toMatchObject({ status: "stale" });
  });

  test("only never and stale are worth asking somebody about", () => {
    expect(needsAcknowledgement({ status: "never" })).toBeTrue();
    expect(
      needsAcknowledgement({
        status: "stale",
        confirmed: record,
        updatedTo: "September 21, 2026",
      }),
    ).toBeTrue();
    expect(
      needsAcknowledgement({ status: "confirmed", confirmed: record }),
    ).toBeFalse();
    // Undefined is a document this does not apply to -- the tenant's own text,
    // or a document nobody is being served.
    expect(needsAcknowledgement(undefined)).toBeFalse();
  });
});

// The action, the read and the panel all key off `LegalDocument.key`, so a
// document added to the registry gets a storage key for free.
test("every document in the registry has a key to be confirmed under", () => {
  const keys = LEGAL_DOCUMENTS.map((document) =>
    legalAcknowledgementSettingKey(document.key),
  );
  expect(new Set(keys).size).toBe(LEGAL_DOCUMENTS.length);
  for (const key of keys) {
    expect(key.startsWith(LEGAL_ACKNOWLEDGEMENT_PREFIX)).toBeTrue();
  }
});
