import { describe, expect, test } from "bun:test";
import {
  completeApproval,
  isLegalSlotKey,
  LEGAL_APPROVAL_SETTING_KEY,
  MINIMUM_APPROVERS,
  resolveApprovalRequired,
} from "@/lib/legal-approval";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";

// The gate is off unless somebody here turned it on, and only an explicit
// `true` counts: a row that cannot be read must not stop an organization
// publishing its own legal text, which is the failure #600 is shaped around.
describe("resolveApprovalRequired", () => {
  test("only an explicit true switches it on", () => {
    expect(resolveApprovalRequired(true)).toBe(true);
  });

  test.each([undefined, null, false, "true", 1, {}])(
    "%p means off",
    (value) => {
      expect(resolveApprovalRequired(value)).toBe(false);
    },
  );
});

// Both halves or neither: an approval with an empty reference records that
// somebody pressed a button, which is not what the gate is for.
describe("completeApproval", () => {
  test("trims what was typed", () => {
    expect(
      completeApproval({ reference: "  Board meeting ", notes: " Fine. " }),
    ).toEqual({ reference: "Board meeting", notes: "Fine." });
  });

  test.each([
    ["no reference", { reference: "   ", notes: "Fine." }],
    ["no notes", { reference: "Board meeting", notes: "" }],
    ["nothing at all", null],
  ])("%s is not an approval", (_name, approval) => {
    expect(completeApproval(approval)).toBeNull();
  });
});

// The gate covers the legal documents and nothing else: every other page
// publishes as it always has.
describe("isLegalSlotKey", () => {
  test("every registered legal document's slot is one", () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(isLegalSlotKey(document.slotKey)).toBe(true);
    }
  });

  test.each(["home.heading", "about.intro", "site_images.gear_placeholder"])(
    "%s is not",
    (key) => {
      expect(isLegalSlotKey(key)).toBe(false);
    },
  );
});

test("the setting sits in its own namespace, beside the other legal rows", () => {
  expect(LEGAL_APPROVAL_SETTING_KEY.startsWith("legal_approval.")).toBe(true);
  expect(MINIMUM_APPROVERS).toBe(2);
});
