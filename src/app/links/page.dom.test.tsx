import { describe, expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";
import { fakePublicSiteClient } from "../../../test/fake-public-site-client";

mock.module("next/image", () => ({
  default: ({ src, alt }: { src: unknown; alt: string }) => (
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

const TENANT = { id: "t1", name: "Example Org", slug: "example" };

function mockSite(items: unknown) {
  mock.module("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () =>
      fakePublicSiteClient({
        tenant: TENANT,
        content: {
          "links.heading": "Find us here",
          "links.intro": "Everything we are asking for right now.",
          "links.items": items,
          "org.instagram_handle": "exampleorg",
        },
      }),
  }));
  return import("./page").then((m) => m.default);
}

const ITEMS = [
  { label: "Upcoming events", url: "/events", published: true },
  {
    label: "Donate gear",
    url: "https://example.org/give",
    description: "Gently used, any size.",
    published: true,
  },
  { label: "Last winter's raffle", url: "/events/raffle", published: false },
];

describe("LinksPage", () => {
  test("renders a published link pointing at its destination", async () => {
    const LinksPage = await mockSite(ITEMS);
    const { getByRole } = render(await LinksPage());

    expect(getByRole("link", { name: /Upcoming events/ })).toHaveAttribute(
      "href",
      "/events",
    );
  });

  // A link, not a button. The page is nothing but navigation, so rendering
  // these through `<Button render={<Link/>}>` -- which is how the rest of the
  // site styles a link as a button -- would have every row on it announce to a
  // screen reader as a button.
  test("the rows are links rather than buttons", async () => {
    const LinksPage = await mockSite(ITEMS);
    const { queryAllByRole } = render(await LinksPage());

    expect(queryAllByRole("button")).toHaveLength(0);
  });

  test("shows the supporting line under the label", async () => {
    const LinksPage = await mockSite(ITEMS);
    const { getByRole } = render(await LinksPage());

    expect(getByRole("link", { name: /Donate gear/ }).textContent).toContain(
      "Gently used, any size.",
    );
  });

  // The switch is the whole reason a seasonal link can stay in the editor
  // rather than being retyped every winter, so an off row must not reach the
  // page at all -- not merely be styled as unavailable.
  test("leaves a link that is switched off off the page", async () => {
    const LinksPage = await mockSite(ITEMS);
    const { queryByRole } = render(await LinksPage());

    expect(queryByRole("link", { name: /raffle/ })).toBeNull();
  });

  test("opens an external link in a new tab and an internal one in place", async () => {
    const LinksPage = await mockSite(ITEMS);
    const { getByRole } = render(await LinksPage());

    const external = getByRole("link", { name: /Donate gear/ });
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noopener noreferrer");

    expect(getByRole("link", { name: /Upcoming events/ })).not.toHaveAttribute(
      "target",
    );
  });

  test("names the organization and the section heading", async () => {
    const LinksPage = await mockSite(ITEMS);
    const { getByRole } = render(await LinksPage());

    expect(getByRole("heading", { level: 1 }).textContent).toBe("Example Org");
    expect(getByRole("heading", { level: 2 }).textContent).toBe("Find us here");
  });

  // `site_content` is a table an operator can write to directly, and the whole
  // output of this page is `href`s. `resolveSiteContent` refuses a slot
  // holding a row like this and serves the registry default instead, so the
  // scheme never reaches the page -- the point of the assertion is that it
  // never does, by whichever of the two mechanisms gets there first.
  test("never renders a destination the site will not publish", async () => {
    const LinksPage = await mockSite([
      ...ITEMS,
      { label: "Broken", url: "javascript:alert(1)", published: true },
    ]);
    const { queryByRole, container } = render(await LinksPage());

    expect(queryByRole("link", { name: /Broken/ })).toBeNull();
    expect(container.innerHTML).not.toContain("javascript:");
  });

  // Nothing to write: an organization that has published no links gets its
  // name, its mark and its tagline, which is a coherent page. An error on the
  // only thing a social profile points at would not be.
  test("renders the organization rather than an error when nothing is published", async () => {
    const LinksPage = await mockSite([]);
    const { getByRole, queryAllByRole } = render(await LinksPage());

    expect(getByRole("heading", { level: 1 }).textContent).toBe("Example Org");
    // Only the two standing links below the stack: Instagram and the website.
    expect(queryAllByRole("link")).toHaveLength(2);
  });
});
