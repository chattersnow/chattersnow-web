import { afterEach, describe, expect, test } from "bun:test";
import {
  formatSender,
  isAllowedFromAddress,
  resolveMailIdentity,
  settingAddress,
  verifiedSendingDomains,
  type MailIdentityInput,
} from "./identity";

/**
 * No mocks and no `server-only` stub: identity.ts is pure above its one reader,
 * which is the whole reason the split exists (#857). The rules that decide who
 * a tenant's mail claims to be from are the part most worth pinning down, and
 * a database is the least convenient place to pin them.
 */

const PLATFORM_FROM = "notifications@chattersnow.org";

const BASE: MailIdentityInput = {
  tenantName: "Example Nonprofit",
  tenantCustomDomain: "example.org",
  fromAddressSetting: undefined,
  replyToSetting: undefined,
  platformFrom: PLATFORM_FROM,
  platformReplyTo: null,
  verifiedDomains: ["chattersnow.org", "example.org"],
};

const originalVerified = process.env.EMAIL_VERIFIED_DOMAINS;

afterEach(() => {
  if (originalVerified === undefined) delete process.env.EMAIL_VERIFIED_DOMAINS;
  else process.env.EMAIL_VERIFIED_DOMAINS = originalVerified;
});

describe("formatSender", () => {
  test("quotes the tenant's name in front of the address", () => {
    expect(formatSender("Chatter Snow", "a@b.org")).toBe(
      '"Chatter Snow" <a@b.org>',
    );
  });

  test("a comma needs no special handling, because everything is quoted", () => {
    expect(formatSender("Example Nonprofit, Inc.", "a@b.org")).toBe(
      '"Example Nonprofit, Inc." <a@b.org>',
    );
  });

  test("escapes a quote and a backslash", () => {
    expect(formatSender('The "Real" Co\\Op', "a@b.org")).toBe(
      '"The \\"Real\\" Co\\\\Op" <a@b.org>',
    );
  });

  test("strips CR and LF, so a name cannot inject a header", () => {
    const sender = formatSender(
      "Evil\r\nBcc: attacker@example.test",
      "a@b.org",
    );

    expect(sender).not.toContain("\r");
    expect(sender).not.toContain("\n");
    expect(sender).toBe('"Evil Bcc: attacker@example.test" <a@b.org>');
  });

  test("passes non-ASCII through as UTF-8", () => {
    expect(formatSender("Café Solidaire", "a@b.org")).toBe(
      '"Café Solidaire" <a@b.org>',
    );
  });

  test("falls back to the bare address when there is no usable name", () => {
    expect(formatSender(null, "a@b.org")).toBe("a@b.org");
    expect(formatSender("   ", "a@b.org")).toBe("a@b.org");
  });

  test("truncates a name too long to belong in a header", () => {
    const sender = formatSender("N".repeat(200), "a@b.org");
    expect(sender).toBe(`"${"N".repeat(60)}" <a@b.org>`);
  });
});

describe("isAllowedFromAddress", () => {
  const verifiedDomains = ["example.org"];

  test("allows the tenant's own verified domain", () => {
    expect(
      isAllowedFromAddress("hello@example.org", {
        verifiedDomains,
        tenantCustomDomain: "example.org",
      }),
    ).toBe(true);
  });

  test("allows a subdomain of it, since owning a parent implies the child", () => {
    expect(
      isAllowedFromAddress("hello@mail.example.org", {
        verifiedDomains: ["mail.example.org"],
        tenantCustomDomain: "example.org",
      }),
    ).toBe(true);
  });

  test("refuses a parent of it -- anyone can be handed a subdomain", () => {
    expect(
      isAllowedFromAddress("hello@example.org", {
        verifiedDomains,
        tenantCustomDomain: "portal.example.org",
      }),
    ).toBe(false);
  });

  test("refuses a verified domain the tenant does not own", () => {
    // The impersonation case: any tenant administrator can write their own
    // notifications.from_address, so a verified-domain check on its own would
    // let one tenant send DKIM-signed mail as another.
    expect(
      isAllowedFromAddress("billing@example.org", {
        verifiedDomains,
        tenantCustomDomain: "other-nonprofit.org",
      }),
    ).toBe(false);
  });

  test("refuses the tenant's own domain when it is not verified", () => {
    expect(
      isAllowedFromAddress("hello@example.org", {
        verifiedDomains: ["chattersnow.org"],
        tenantCustomDomain: "example.org",
      }),
    ).toBe(false);
  });

  test("verification is exact, not a suffix -- a provider verifies one domain", () => {
    expect(
      isAllowedFromAddress("hello@mail.example.org", {
        verifiedDomains,
        tenantCustomDomain: "example.org",
      }),
    ).toBe(false);
  });

  test("refuses everything when the tenant has no domain of its own", () => {
    expect(
      isAllowedFromAddress("hello@example.org", {
        verifiedDomains,
        tenantCustomDomain: null,
      }),
    ).toBe(false);
  });
});

describe("verifiedSendingDomains", () => {
  test("defaults to the domain of EMAIL_FROM, reproducing the old behaviour", () => {
    delete process.env.EMAIL_VERIFIED_DOMAINS;
    expect(verifiedSendingDomains(PLATFORM_FROM)).toEqual(["chattersnow.org"]);
  });

  test("reads the domain out of a composed EMAIL_FROM", () => {
    delete process.env.EMAIL_VERIFIED_DOMAINS;
    expect(
      verifiedSendingDomains('"Chatter Snow" <notifications@chattersnow.org>'),
    ).toEqual(["chattersnow.org"]);
  });

  test("splits, trims and lowercases the configured list", () => {
    process.env.EMAIL_VERIFIED_DOMAINS = " Example.ORG , chattersnow.org ,";
    expect(verifiedSendingDomains(PLATFORM_FROM)).toEqual([
      "example.org",
      "chattersnow.org",
    ]);
  });

  test("is empty when nothing resolves at all", () => {
    delete process.env.EMAIL_VERIFIED_DOMAINS;
    expect(verifiedSendingDomains(null)).toEqual([]);
  });
});

describe("settingAddress", () => {
  test("reads a usable address, normalized", () => {
    expect(settingAddress("  Hello@Example.ORG ")).toBe("hello@example.org");
  });

  test("treats anything unusable as unset", () => {
    // "" is how "unset" is written -- app_settings has no delete grant.
    for (const value of ["", "   ", "not-an-address", null, 42, ["a@b.org"]]) {
      expect(settingAddress(value)).toBeNull();
    }
  });
});

describe("resolveMailIdentity", () => {
  test("uses the tenant's name on the platform address by default", () => {
    expect(resolveMailIdentity(BASE)).toEqual({
      from: '"Example Nonprofit" <notifications@chattersnow.org>',
    });
  });

  test("uses the tenant's own address once it is verified and owned", () => {
    expect(
      resolveMailIdentity({ ...BASE, fromAddressSetting: "hello@example.org" }),
    ).toEqual({ from: '"Example Nonprofit" <hello@example.org>' });
  });

  test("ignores a verified address belonging to another tenant", () => {
    expect(
      resolveMailIdentity({
        ...BASE,
        tenantCustomDomain: "other-nonprofit.org",
        fromAddressSetting: "billing@example.org",
      }),
    ).toEqual({
      from: '"Example Nonprofit" <notifications@chattersnow.org>',
    });
  });

  test("ignores an address on a domain nobody has verified", () => {
    expect(
      resolveMailIdentity({
        ...BASE,
        verifiedDomains: ["chattersnow.org"],
        fromAddressSetting: "hello@example.org",
      }),
    ).toEqual({
      from: '"Example Nonprofit" <notifications@chattersnow.org>',
    });
  });

  test("ignores an unset, blank or malformed setting", () => {
    for (const fromAddressSetting of ["", "  ", "nonsense", null, 7]) {
      expect(resolveMailIdentity({ ...BASE, fromAddressSetting }).from).toBe(
        '"Example Nonprofit" <notifications@chattersnow.org>',
      );
    }
  });

  test("names the tenant even when EMAIL_FROM carries a display name of its own", () => {
    expect(
      resolveMailIdentity({
        ...BASE,
        platformFrom: '"Chatter Snow" <notifications@chattersnow.org>',
      }).from,
    ).toBe('"Example Nonprofit" <notifications@chattersnow.org>');
  });

  test("is empty when nothing configures a sender at all", () => {
    // sendEmail() refuses this, which is the answer it gave before #857 too.
    expect(resolveMailIdentity({ ...BASE, platformFrom: null }).from).toBe("");
  });

  test("prefers the tenant's Reply-To over the platform's", () => {
    expect(
      resolveMailIdentity({
        ...BASE,
        replyToSetting: "board@example.org",
        platformReplyTo: "hello@chattersnow.org",
      }).replyTo,
    ).toBe("board@example.org");
  });

  test("accepts a tenant Reply-To on any domain, unlike From", () => {
    // A From address is a claim about who sent a message; a Reply-To is a
    // routing preference, and any real mailbox answers it legitimately.
    expect(
      resolveMailIdentity({
        ...BASE,
        replyToSetting: "team@somewhere-else.com",
      }).replyTo,
    ).toBe("team@somewhere-else.com");
  });

  test("falls back to the platform Reply-To", () => {
    expect(
      resolveMailIdentity({ ...BASE, platformReplyTo: "hello@chattersnow.org" })
        .replyTo,
    ).toBe("hello@chattersnow.org");
  });

  test("omits Reply-To entirely rather than sending an empty one", () => {
    expect(resolveMailIdentity(BASE)).not.toHaveProperty("replyTo");
  });
});
