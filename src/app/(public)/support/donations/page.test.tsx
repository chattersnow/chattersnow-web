import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DEFAULT_GIVING_SETTINGS, type GivingSettings } from "@/lib/giving";
import { DEFAULT_SITE_CONTENT, resolveSiteContent } from "@/lib/site-content";

let giving: GivingSettings = DEFAULT_GIVING_SETTINGS;
let content = DEFAULT_SITE_CONTENT;

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({}),
}));
mock.module("@/lib/site-images", () => ({
  getSiteImageUrls: async () => ({}),
}));
mock.module("@/lib/public-site", () => ({
  getPublicSite: async () => ({ content }),
  publicTitle: (_site: unknown, title: string) => title,
}));
mock.module("@/lib/public-giving", () => ({
  getPublicGivingSettings: async () => giving,
}));

const { default: DonationsPage } = await import("./page");

const PUBLISHED: GivingSettings = {
  enabled: true,
  providerLabel: "Givebutter",
  url: "https://givebutter.com/example",
  mode: "link",
  suggestedAmounts: [25, 50, 100],
  amountParam: "amount",
  recurringAvailable: true,
};

/**
 * The Give card is the whole of #1389's public surface, and the state that
 * matters most is the one every tenant is in on the day it ships: giving
 * unconfigured, and the Donations page exactly as it was.
 */
describe("the Donations page's Give card", () => {
  beforeEach(() => {
    giving = DEFAULT_GIVING_SETTINGS;
    content = DEFAULT_SITE_CONTENT;
  });

  test("is absent, with the rest of the page intact, when giving is off", async () => {
    render(await DonationsPage());

    expect(screen.queryByRole("link", { name: /give/i })).toBeNull();
    expect(screen.queryByText(/opens on/i)).toBeNull();
    expect(screen.queryByText("Give")).toBeNull();
    // The monetary and in-kind cards are untouched.
    expect(
      screen.getByText(DEFAULT_SITE_CONTENT.text("support.inkind_title")),
    ).toBeTruthy();
  });

  test("is absent when giving is on but no address has been pasted yet", async () => {
    giving = { ...PUBLISHED, url: "" };
    render(await DonationsPage());

    expect(screen.queryByText(/opens on/i)).toBeNull();
  });

  test("is present, and points at the stable route, once it is configured", async () => {
    giving = PUBLISHED;
    render(await DonationsPage());

    const amount = screen.getByRole("link", { name: "$25" });
    expect(amount.getAttribute("href")).toBe("/support/donate?amount=25");
    expect(
      screen
        .getByRole("link", { name: "Give another amount" })
        .getAttribute("href"),
    ).toBe("/support/donate");
    // The provider is named so nobody is surprised by where they land, and
    // only ever in these words.
    expect(screen.getByText("Opens on Givebutter.")).toBeTruthy();
    expect(screen.getByText("You can also give monthly.")).toBeTruthy();
  });

  test("offers no amount buttons when the provider takes no amount parameter", async () => {
    giving = { ...PUBLISHED, amountParam: "" };
    render(await DonationsPage());

    expect(screen.queryByRole("link", { name: "$25" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Give" }).getAttribute("href"),
    ).toBe("/support/donate");
  });

  // The platform's own default is empty, and blank means the sentence is not
  // rendered at all rather than rendered as nothing (docs/legal-basis.md).
  test("says nothing about tax until the organization has written it", async () => {
    giving = PUBLISHED;
    render(await DonationsPage());
    expect(screen.queryByText(/tax/i)).toBeNull();
  });

  test("renders the organization's own tax note when it has one", async () => {
    giving = PUBLISHED;
    content = resolveSiteContent([
      {
        key: "support.giving_tax_note",
        value: "We are not a registered charity, so gifts are not deductible.",
      },
    ]);
    render(await DonationsPage());

    expect(
      screen.getByText(
        "We are not a registered charity, so gifts are not deductible.",
      ),
    ).toBeTruthy();
  });

  test("frames the provider only in embed mode, and only its own origin", async () => {
    giving = { ...PUBLISHED, mode: "embed" };
    const { container } = render(await DonationsPage());

    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe("https://givebutter.com/example");
  });
});
