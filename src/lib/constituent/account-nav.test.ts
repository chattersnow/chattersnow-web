import { describe, expect, test } from "bun:test";
import { constituentAccountNav } from "@/lib/constituent/account-nav";

const ON = true;
const OFF = false;

const CLAIMS = {
  email: "rickie@chattersnow.org",
  user_metadata: { full_name: "Rickie Cruz" },
};

describe("constituentAccountNav", () => {
  test("is off when the tenant has not bought the module", () => {
    expect(constituentAccountNav(OFF, CLAIMS)).toEqual({ enabled: false });
  });

  test("is enabled and signed out when there is no session", () => {
    expect(constituentAccountNav(ON, null)).toEqual({
      enabled: true,
      signedIn: false,
    });
  });

  test("names the account when someone is signed in", () => {
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
