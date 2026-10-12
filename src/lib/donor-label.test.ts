import { describe, expect, test } from "bun:test";
import { ANONYMOUS_DONOR_LABEL, donorDisplayName } from "./donor-label";

describe("donorDisplayName", () => {
  test("a donation with no donor is anonymous", () => {
    expect(donorDisplayName(null, null)).toBe(ANONYMOUS_DONOR_LABEL);
  });

  test("an anonymized person reads as anonymous", () => {
    expect(donorDisplayName("p1", { name: null, is_anonymous: true })).toBe(
      ANONYMOUS_DONOR_LABEL,
    );
  });

  test("names a donor the reader can see", () => {
    expect(donorDisplayName("p1", { name: " Jane Donor " })).toBe("Jane Donor");
  });

  test("a donor the reader cannot see is not anonymous", () => {
    expect(donorDisplayName("p1", null)).toBe("—");
  });
});
