import { describe, expect, test } from "bun:test";
import { accountLabel } from "@/lib/constituent/account-label";

describe("accountLabel", () => {
  test("prefers the first name from full_name", () => {
    expect(
      accountLabel({
        email: "a.constantinou@example.test",
        user_metadata: { full_name: "Alexandra Constantinou-Whitfield" },
      }),
    ).toBe("Alexandra");
  });

  test("falls back to name when full_name is absent", () => {
    expect(
      accountLabel({ email: "x@example.test", user_metadata: { name: "Sam" } }),
    ).toBe("Sam");
  });

  test("falls back to the email local part when there is no name", () => {
    expect(accountLabel({ email: "rickie@chattersnow.org" })).toBe("rickie");
  });

  // A Google account with a blank display name is the realistic source of
  // this: the claim is present, so a truthiness test on the key alone would
  // greet somebody as the empty string.
  test("treats a blank name as no name", () => {
    expect(
      accountLabel({
        email: "blank@example.test",
        user_metadata: { full_name: "   " },
      }),
    ).toBe("blank");
  });

  test("is null when the claims carry nothing usable", () => {
    expect(accountLabel({})).toBeNull();
    expect(accountLabel({ email: "", user_metadata: null })).toBeNull();
  });

  // The claims are typed loosely on purpose -- JwtPayload's user_metadata is
  // whatever the identity provider put there -- so a non-string must not reach
  // the header as "[object Object]".
  test("ignores a non-string name", () => {
    expect(
      accountLabel({
        email: "shape@example.test",
        user_metadata: { full_name: { given: "Nope" } as unknown as string },
      }),
    ).toBe("shape");
  });
});
