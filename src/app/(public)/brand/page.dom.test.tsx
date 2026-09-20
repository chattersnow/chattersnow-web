import { describe, expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";
import { DEFAULT_TYPOGRAPHY } from "@/lib/branding";
import { fakePublicSiteClient } from "../../../../test/fake-public-site-client";

mock.module("next/image", () => ({
  default: ({ src, alt }: { src: unknown; alt: string }) => (
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

// The gate reads `public_page_visibility` through its own client and its own
// React `cache()`, neither of which this test is about: it is about what the
// page derives once it is allowed to render. `requireVisiblePage` has its own
// coverage in page-visibility.test.ts.
//
// The rest of the module is spread back in rather than left out. A factory
// replaces the module wholesale, so naming only the two functions this test
// steers dropped every other export -- and the day something else under the
// page's import graph reached for `getPageVisibility`, the file stopped
// loading at all with "Export named 'getPageVisibility' not found", which
// reads as a missing export rather than as this mock.
const realPageVisibility = await import("@/lib/page-visibility");

mock.module("@/lib/page-visibility", () => ({
  ...realPageVisibility,
  requireVisiblePage: async () => {},
  isPageVisible: async () => true,
}));

// A tenant with its own palette, its own gradient, and -- the case the old
// hand-built guide could not express -- four accent stops rather than six.
//
// Read at render rather than captured once, so a test can hand the page a
// different tenant: the typeface section says something different for a tenant
// that has picked a set than for one that has not (#1262).
let branding: Record<string, unknown> = {
  primary: "#0b7285",
  accent_stops: ["#111111", "#222222", "#333333", "#444444"],
};

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () =>
    fakePublicSiteClient({
      branding,
      content: { "org.tagline": "A tagline this tenant wrote" },
    }),
}));

const { default: BrandPage } = await import("./page");

describe("BrandPage", () => {
  test("shows the tenant's own colour rather than the stylesheet's default", async () => {
    const { container } = render(await BrandPage());

    const swatches = container.querySelector("#color")!.textContent!;
    expect(swatches).toContain("#0b7285");
    // The stylesheet's accent, which this tenant has overridden.
    expect(swatches).not.toContain("#70419a");
  });

  test("falls back to the stylesheet's value for a token the tenant has not set", async () => {
    const { container } = render(await BrandPage());

    // `background` is unset above, so the guide documents what a visitor
    // actually sees -- the stylesheet's colour -- rather than omitting it.
    expect(container.querySelector("#color")!.textContent).toContain("#f7f0ff");
  });

  test("prints the dark-mode value as a hex, not as the CSS expression", async () => {
    const { container } = render(await BrandPage());

    const swatches = container.querySelector("#color")!.textContent!;
    // The dark form of this tenant's teal accent, computed rather than left
    // for the browser -- a designer has to be able to paste it into Canva.
    expect(swatches).toContain("#72c7db");
    expect(swatches).not.toContain("oklch(");
  });

  test("says why the two neutral tokens have no dark value", async () => {
    const { container } = render(await BrandPage());

    // Blank halves read as an oversight; these two genuinely keep the
    // stylesheet's neutral surfaces in dark mode, so the page says so.
    expect(container.querySelector("#color")!.textContent).toContain(
      "Neutral surface, not a brand colour",
    );
  });

  test("draws as many gradient stops as the tenant set, not a fixed six", async () => {
    const { container } = render(await BrandPage());

    const stops = container.querySelectorAll("#color li");
    expect(stops).toHaveLength(4);
    expect(container.querySelector("#color")!.textContent).toContain("33%");
  });

  test("sets the type specimen in the tenant's own copy", async () => {
    const { container } = render(await BrandPage());

    expect(container.querySelector("#type")!.textContent).toContain(
      "A tagline this tenant wrote",
    );
  });

  test("names the platform's default set for a tenant that has picked none", async () => {
    const { container } = render(await BrandPage());

    const type = container.querySelector("#type")!.textContent!;
    expect(type).toContain(DEFAULT_TYPOGRAPHY.label);
    expect(type).toContain(DEFAULT_TYPOGRAPHY.sans.name);
  });

  test("names the tenant's own families, and where to get them", async () => {
    const unset = branding;
    branding = { ...branding, typography: "rounded" };
    try {
      const { container } = render(await BrandPage());

      const section = container.querySelector("#type")!;
      const type = section.textContent!;
      // Both faces the set pairs, not just the one the description mentions:
      // a volunteer making a flyer needs the script family by name too.
      expect(type).toContain("Quicksand");
      expect(type).toContain("Rock Salt");
      expect(type).not.toContain(DEFAULT_TYPOGRAPHY.sans.name);
      // Rock Salt is Apache-licensed and the other seven are not, which is why
      // the licence is a property of the family rather than a sentence here.
      expect(type).toContain("Apache License 2.0");
      expect(type).toContain("SIL Open Font License");

      const links = [...section.querySelectorAll("a")].map((a) =>
        a.getAttribute("href"),
      );
      expect(links).toContain("https://fonts.google.com/specimen/Rock+Salt");
    } finally {
      branding = unset;
    }
  });

  test("no longer tells the organization the typeface is not its own", async () => {
    const { container } = render(await BrandPage());

    const type = container.querySelector("#type")!.textContent!;
    expect(type).not.toContain("the typeface is not yours to set");
    expect(type).not.toContain("platform's type system");
    expect(type).not.toContain(
      "a change to the software rather than a setting",
    );
    // What is still the platform's, and stays said: the scale (#1262).
    expect(type).toContain("The type scale is not yours to set");
  });
});
