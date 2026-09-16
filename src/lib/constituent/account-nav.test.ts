import { describe, expect, test } from "bun:test";
import { constituentAccountNav } from "@/lib/constituent/account-nav";

const ON = { constituent_accounts: true };
const OFF = { constituent_accounts: false };

const CLAIMS = {
  email: "rickie@chattersnow.org",
  user_metadata: { full_name: "Rickie Cruz" },
};

describe("constituentAccountNav", () => {
  test("is off when the tenant has not bought the module", () => {
    expect(constituentAccountNav(OFF, CLAIMS)).toEqual({ enabled: false });
  });

  // The catalog row for this module is the only one that defaults to false, so
  // a tenant that has never been asked resolves to an explicit false in the
  // view rather than to an absent row. Absent fails *open*, which is right for
  // a module added after a map was read and would be wrong here -- worth
  // pinning, because "fails open" and "defaults to off" sound like they should
  // collide. The view is what keeps them apart; this records which one wins for
  // a key that is present.
  test("a tenant's explicit false beats the fail-open default", () => {
    expect(constituentAccountNav(OFF, null).enabled).toBe(false);
  });

  test("is enabled and signed out when there is no verified token", () => {
    expect(constituentAccountNav(ON, null)).toEqual({
      enabled: true,
      signedIn: false,
    });
  });

  test("names the account when the token verifies", () => {
    expect(constituentAccountNav(ON, CLAIMS)).toEqual({
      enabled: true,
      signedIn: true,
      label: "Rickie",
      email: "rickie@chattersnow.org",
    });
  });

  // A Google account may carry no email claim at all, and the control has to
  // render something rather than "undefined".
  test("tolerates claims with no address", () => {
    expect(
      constituentAccountNav(ON, { user_metadata: { name: "Sam" } }),
    ).toEqual({
      enabled: true,
      signedIn: true,
      label: "Sam",
      email: null,
    });
  });
});
