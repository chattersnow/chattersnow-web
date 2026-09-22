import { describe, expect, test } from "bun:test";
import { parsePersonScreeningForm } from "./screening-form";

const TODAY = "2026-09-22";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const VALID = { tierId: "tier-1", clearedOn: "2026-09-20", expiresOn: "" };

describe("parsePersonScreeningForm", () => {
  test("accepts a level and a date", () => {
    expect(parsePersonScreeningForm(form(VALID), TODAY)).toEqual({
      data: { tier_id: "tier-1", cleared_on: "2026-09-20", expires_on: null },
    });
  });

  test("keeps an expiry when one is given", () => {
    const result = parsePersonScreeningForm(
      form({ ...VALID, expiresOn: "2029-09-20" }),
      TODAY,
    );
    expect(result).toEqual({
      data: {
        tier_id: "tier-1",
        cleared_on: "2026-09-20",
        expires_on: "2029-09-20",
      },
    });
  });

  test("allows an expiry on the same day it was given", () => {
    const result = parsePersonScreeningForm(
      form({ ...VALID, expiresOn: "2026-09-20" }),
      TODAY,
    );
    expect(result).toEqual({
      data: {
        tier_id: "tier-1",
        cleared_on: "2026-09-20",
        expires_on: "2026-09-20",
      },
    });
  });

  test("requires a level", () => {
    expect(
      parsePersonScreeningForm(form({ ...VALID, tierId: "  " }), TODAY),
    ).toEqual({ error: "A screening level is required.", field: "tierId" });
  });

  test("requires a decision date", () => {
    expect(
      parsePersonScreeningForm(form({ ...VALID, clearedOn: "" }), TODAY),
    ).toEqual({ error: "A decision date is required.", field: "clearedOn" });
  });

  test("rejects a decision date that is not a calendar day", () => {
    expect(
      parsePersonScreeningForm(
        form({ ...VALID, clearedOn: "20 September 2026" }),
        TODAY,
      ),
    ).toEqual({ error: "A decision date is required.", field: "clearedOn" });
  });

  test("rejects a decision date in the future, against the tenant's day", () => {
    expect(
      parsePersonScreeningForm(
        form({ ...VALID, clearedOn: "2026-09-23" }),
        TODAY,
      ),
    ).toEqual({
      error: "The decision date cannot be in the future.",
      field: "clearedOn",
    });
  });

  test("accepts the tenant's own today, which a UTC check could refuse", () => {
    const result = parsePersonScreeningForm(
      form({ ...VALID, clearedOn: TODAY }),
      TODAY,
    );
    expect(result).toEqual({
      data: { tier_id: "tier-1", cleared_on: TODAY, expires_on: null },
    });
  });

  test("rejects an expiry before the decision", () => {
    expect(
      parsePersonScreeningForm(
        form({ ...VALID, expiresOn: "2026-09-19" }),
        TODAY,
      ),
    ).toEqual({
      error: "The clearance cannot run out before it was given.",
      field: "expiresOn",
    });
  });

  test("rejects an expiry that is not a calendar day", () => {
    expect(
      parsePersonScreeningForm(form({ ...VALID, expiresOn: "soon" }), TODAY),
    ).toEqual({ error: "That is not a valid date.", field: "expiresOn" });
  });

  // The regression test this ticket exists for. The parser is an allowlist:
  // anything a hand-posted form adds is not rejected with a message telling
  // the sender what to try next -- it is never read, and there is no column
  // for it to reach. If this ever fails, somebody has added a field that could
  // carry a check result into the portal.
  test("reads nothing but the three fields it names", () => {
    const smuggled = form({
      ...VALID,
      notes: "DBS clear, cert 1234567890",
      reason: "spent conviction, 2011",
      provider: "Acme Screening Ltd",
      result: "clear",
      review_note: "discussed with the board",
    });
    const result = parsePersonScreeningForm(smuggled, TODAY);
    expect("data" in result).toBe(true);
    if (!("data" in result)) return;
    expect(Object.keys(result.data).sort()).toEqual([
      "cleared_on",
      "expires_on",
      "tier_id",
    ]);
    expect(JSON.stringify(result.data)).not.toContain("conviction");
    expect(JSON.stringify(result.data)).not.toContain("Acme");
  });
});
