import { describe, expect, test } from "bun:test";
import {
  DEFAULT_GIVING_SETTINGS,
  MAX_GIVING_URL_LENGTH,
  formatGivingAmount,
  givingEmbedOrigin,
  givingEmbedSrc,
  givingIsPublished,
  givingUrlError,
  givingUrlWithAmount,
  isValidGivingUrl,
  parseGivingSettings,
  parseSuggestedAmounts,
  resolvePublicGivingSettings,
  type GivingSettings,
} from "./giving";

function settings(overrides: Partial<GivingSettings> = {}): GivingSettings {
  return { ...DEFAULT_GIVING_SETTINGS, ...overrides };
}

describe("givingUrlError", () => {
  test("accepts the shapes a provider actually hands out", () => {
    for (const url of [
      "https://www.zeffy.com/donation-form/abc123",
      "https://givebutter.com/some-org",
      "https://buy.stripe.com/test_abc?locale=en",
      "https://example.org/give/#monthly",
      "https://sub.domain.example.co.uk:8443/donate",
    ]) {
      expect(givingUrlError(url), url).toBeNull();
    }
  });

  // The whole reason this is validated in the RPC as well as here: the value
  // ends up as an `href` on a public page.
  test("refuses a scheme that would execute rather than navigate", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://example.org/donate",
      "//example.org/donate",
      "/support/donate",
    ]) {
      expect(givingUrlError(url), url).not.toBeNull();
    }
  });

  test("refuses a host nobody outside the office could reach", () => {
    expect(givingUrlError("https://localhost:3000/donate")).not.toBeNull();
    expect(givingUrlError("https://intranet/donate")).not.toBeNull();
    // A trailing dot is a different name to most link previews than to DNS.
    expect(givingUrlError("https://example.org./donate")).not.toBeNull();
  });

  test("refuses embedded credentials, which read as the wrong host", () => {
    expect(
      givingUrlError("https://example.org@evil.example/donate"),
    ).not.toBeNull();
    expect(
      givingUrlError("https://user:pass@example.org/donate"),
    ).not.toBeNull();
  });

  test("refuses an empty address and one past the length cap", () => {
    expect(givingUrlError("")).not.toBeNull();
    expect(givingUrlError("   ")).not.toBeNull();
    const long = `https://example.org/${"a".repeat(MAX_GIVING_URL_LENGTH)}`;
    expect(givingUrlError(long)).not.toBeNull();
  });

  test("ignores surrounding whitespace, which is how a paste arrives", () => {
    expect(isValidGivingUrl("  https://example.org/donate  ")).toBe(true);
  });
});

describe("givingIsPublished", () => {
  test("needs the switch and a usable address, not just the switch", () => {
    expect(
      givingIsPublished(
        settings({ enabled: true, url: "https://example.org/donate" }),
      ),
    ).toBe(true);
    // Switched on with nothing pasted yet: today's page, not a button to
    // nowhere.
    expect(givingIsPublished(settings({ enabled: true, url: "" }))).toBe(false);
    expect(givingIsPublished(settings({ enabled: true, url: "nope" }))).toBe(
      false,
    );
    expect(
      givingIsPublished(
        settings({ enabled: false, url: "https://example.org/donate" }),
      ),
    ).toBe(false);
  });
});

describe("givingUrlWithAmount", () => {
  const url = "https://example.org/donate";

  test("appends the provider's own parameter name", () => {
    expect(givingUrlWithAmount(url, 50, "amount")).toBe(
      "https://example.org/donate?amount=50",
    );
    expect(givingUrlWithAmount(url, 50, "amt")).toBe(
      "https://example.org/donate?amt=50",
    );
  });

  test("keeps the parameters the provider's own link already carried", () => {
    expect(
      givingUrlWithAmount(
        "https://example.org/donate?campaign=winter",
        25,
        "amount",
      ),
    ).toBe("https://example.org/donate?campaign=winter&amount=25");
  });

  // Two `amount=` pairs would leave the provider guessing between them.
  test("replaces an amount already on the configured URL", () => {
    expect(
      givingUrlWithAmount("https://example.org/donate?amount=10", 25, "amount"),
    ).toBe("https://example.org/donate?amount=25");
  });

  test("a provider with no amount parameter gets a plain link", () => {
    expect(givingUrlWithAmount(url, 50, "")).toBe(url);
  });

  test("leaves an unusable URL and a nonsense amount alone", () => {
    expect(givingUrlWithAmount("javascript:alert(1)", 50, "amount")).toBe(
      "javascript:alert(1)",
    );
    expect(givingUrlWithAmount(url, 0, "amount")).toBe(url);
    expect(givingUrlWithAmount(url, Number.NaN, "amount")).toBe(url);
  });
});

describe("the embed allowlist", () => {
  test("is derived from the configured URL's own host", () => {
    expect(givingEmbedOrigin("https://give.example.org/f/1?a=2")).toBe(
      "https://give.example.org",
    );
    expect(givingEmbedOrigin("https://example.org:8443/donate")).toBe(
      "https://example.org:8443",
    );
    expect(givingEmbedOrigin("http://example.org/donate")).toBeNull();
  });

  test("frames nothing unless giving is on, published and set to embed", () => {
    const url = "https://give.example.org/form";
    expect(
      givingEmbedSrc(settings({ enabled: true, url, mode: "embed" })),
    ).toBe("https://give.example.org/form");
    expect(
      givingEmbedSrc(settings({ enabled: true, url, mode: "link" })),
    ).toBeNull();
    expect(
      givingEmbedSrc(settings({ enabled: false, url, mode: "embed" })),
    ).toBeNull();
    expect(
      givingEmbedSrc(settings({ enabled: true, url: "nope", mode: "embed" })),
    ).toBeNull();
  });

  // Rebuilt from the parsed URL rather than passed through, so whatever is in
  // the setting can only ever resolve to the host already published as a link.
  test("rebuilds the src from origin, path and query alone", () => {
    expect(
      givingEmbedSrc(
        settings({
          enabled: true,
          mode: "embed",
          url: "https://give.example.org/form?x=1#anchor",
        }),
      ),
    ).toBe("https://give.example.org/form?x=1");
  });
});

describe("parseSuggestedAmounts", () => {
  test("keeps whole positive amounts in the tenant's order", () => {
    expect(parseSuggestedAmounts([25, 50, 100])).toEqual([25, 50, 100]);
  });

  test("drops what the RPC would refuse rather than failing the read", () => {
    expect(
      parseSuggestedAmounts([25, -5, 0, 12.5, "abc", null, 25, 1_000_000]),
    ).toEqual([25]);
  });

  test("caps the list, so a bad row cannot fill the card with buttons", () => {
    expect(parseSuggestedAmounts([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  test("anything that is not a list is no amounts at all", () => {
    expect(parseSuggestedAmounts(null)).toEqual([]);
    expect(parseSuggestedAmounts("25,50")).toEqual([]);
  });
});

describe("parseGivingSettings", () => {
  test("reads the shape get_giving_settings() returns", () => {
    expect(
      parseGivingSettings({
        enabled: true,
        provider_label: "  Zeffy  ",
        url: " https://example.org/donate ",
        mode: "embed",
        suggested_amounts: [25, 50],
        amount_param: "amount",
        recurring_available: true,
      }),
    ).toEqual({
      enabled: true,
      providerLabel: "Zeffy",
      url: "https://example.org/donate",
      mode: "embed",
      suggestedAmounts: [25, 50],
      amountParam: "amount",
      recurringAvailable: true,
    });
  });

  test("falls back to the defaults for a missing or malformed answer", () => {
    expect(parseGivingSettings(null)).toEqual(DEFAULT_GIVING_SETTINGS);
    expect(parseGivingSettings("nope")).toEqual(DEFAULT_GIVING_SETTINGS);
    expect(parseGivingSettings({ mode: "iframe", enabled: "yes" })).toEqual(
      DEFAULT_GIVING_SETTINGS,
    );
  });
});

describe("resolvePublicGivingSettings", () => {
  test("resolves the view's slot/value rows", () => {
    expect(
      resolvePublicGivingSettings([
        { slot: "enabled", value: true },
        { slot: "provider_label", value: "Givebutter" },
        { slot: "url", value: "https://givebutter.com/example" },
        { slot: "mode", value: "link" },
        { slot: "suggested_amounts", value: [25, 50] },
        { slot: "amount_param", value: "amount" },
        { slot: "recurring_available", value: false },
      ]),
    ).toEqual({
      enabled: true,
      providerLabel: "Givebutter",
      url: "https://givebutter.com/example",
      mode: "link",
      suggestedAmounts: [25, 50],
      amountParam: "amount",
      recurringAvailable: false,
    });
  });

  // What the view actually returns while giving is off: `enabled` false and
  // every other value withheld.
  test("an off tenant resolves to the defaults", () => {
    expect(
      resolvePublicGivingSettings([
        { slot: "enabled", value: false },
        { slot: "provider_label", value: "" },
        { slot: "url", value: "" },
        { slot: "mode", value: "link" },
        { slot: "suggested_amounts", value: [] },
        { slot: "amount_param", value: "" },
        { slot: "recurring_available", value: false },
      ]),
    ).toEqual(DEFAULT_GIVING_SETTINGS);
  });

  test("no rows at all is no giving path", () => {
    expect(resolvePublicGivingSettings([])).toEqual(DEFAULT_GIVING_SETTINGS);
  });
});

describe("formatGivingAmount", () => {
  test("is a button label, not a ledger figure", () => {
    expect(formatGivingAmount(25)).toBe("$25");
    expect(formatGivingAmount(1000)).toBe("$1,000");
  });
});
