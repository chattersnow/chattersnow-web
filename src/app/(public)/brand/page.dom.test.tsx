import { describe, expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";
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
mock.module("@/lib/page-visibility", () => ({
  requireVisiblePage: async () => {},
  isPageVisible: async () => true,
}));

// A tenant with its own palette, its own gradient, and -- the case the old
// hand-built guide could not express -- four accent stops rather than six.
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () =>
    fakePublicSiteClient({
      branding: {
        primary: "#0b7285",
        accent_stops: ["#111111", "#222222", "#333333", "#444444"],
      },
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

  test("does not claim the typeface is the organization's", async () => {
    const { container } = render(await BrandPage());

    // The one section that is the platform's rather than the tenant's, and it
    // has to say so: there is no `brand.font_*` token behind it (#845).
    expect(container.querySelector("#type")!.textContent).toContain(
      "platform's type system",
    );
  });
});
