import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DEFAULT_GIVING_SETTINGS, type GivingSettings } from "@/lib/giving";

let giving: GivingSettings = DEFAULT_GIVING_SETTINGS;
let sectionVisible = true;

class NotFound extends Error {}
const notFoundMock = mock(() => {
  throw new NotFound("NEXT_NOT_FOUND");
});

mock.module("next/navigation", () => ({ notFound: notFoundMock }));
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({}),
}));
mock.module("@/lib/page-visibility", () => ({
  isPageVisible: async () => sectionVisible,
}));
mock.module("@/lib/public-giving", () => ({
  getPublicGivingSettings: async () => giving,
}));

const { GET } = await import("./route");

const PUBLISHED: GivingSettings = {
  enabled: true,
  providerLabel: "Givebutter",
  url: "https://givebutter.com/example",
  mode: "link",
  suggestedAmounts: [25, 50],
  amountParam: "amount",
  recurringAvailable: false,
};

function request(url = "https://www.example.org/support/donate") {
  return new Request(url);
}

/**
 * The address a printed card or a QR code carries, so the cases that matter
 * are the ones nobody can reprint their way out of: where it sends people,
 * and what it does when there is nowhere to send them.
 */
describe("GET /support/donate", () => {
  beforeEach(() => {
    giving = DEFAULT_GIVING_SETTINGS;
    sectionVisible = true;
  });

  test("302s to the configured giving page", async () => {
    giving = PUBLISHED;
    const response = await GET(request());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://givebutter.com/example",
    );
    // The destination is a setting somebody can change this afternoon.
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("carries an amount the tenant actually offers", async () => {
    giving = PUBLISHED;
    const response = await GET(
      request("https://www.example.org/support/donate?amount=25"),
    );

    expect(response.headers.get("location")).toBe(
      "https://givebutter.com/example?amount=25",
    );
  });

  // Somebody following a stale printed link should still land on the giving
  // page rather than on an error.
  test("drops an amount this tenant does not offer", async () => {
    giving = PUBLISHED;
    for (const query of ["?amount=999", "?amount=abc", "?amount=-5"]) {
      const response = await GET(
        request(`https://www.example.org/support/donate${query}`),
      );
      expect(response.headers.get("location"), query).toBe(
        "https://givebutter.com/example",
      );
    }
  });

  test("404s when giving is off", async () => {
    expect(GET(request())).rejects.toThrow(NotFound);
  });

  test("404s when giving is on but no address has been pasted", async () => {
    giving = { ...PUBLISHED, url: "" };
    expect(GET(request())).rejects.toThrow(NotFound);
  });

  // A route handler renders no layout, so the section's own gate never runs
  // for this URL unless it is checked here.
  test("404s when the board has hidden the Support section", async () => {
    giving = PUBLISHED;
    sectionVisible = false;
    expect(GET(request())).rejects.toThrow(NotFound);
  });
});
