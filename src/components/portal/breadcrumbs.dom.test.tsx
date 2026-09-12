import { describe, expect, mock, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let pathname = "/portal/home";

// Spread the real module: something in the nav tree's import graph reaches
// for `redirect`, and replacing next/navigation wholesale breaks the import
// rather than the test.
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  usePathname: () => pathname,
}));

const { PortalBreadcrumbs } = await import("./breadcrumbs");

/** The trail as a reader reads it, so a test says what the page shows. */
function trail() {
  return within(screen.getByRole("navigation", { name: "Breadcrumb" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent?.trim())
    .join(" › ");
}

describe("PortalBreadcrumbs", () => {
  test("names the section a page lives in", () => {
    // #948's reason for existing: "Roles" is a page in two sections with the
    // same h1 in each, and the page itself had no way to say which.
    pathname = "/portal/administration/roles";
    render(<PortalBreadcrumbs current="Roles" />);
    expect(trail()).toBe("Administration › Roles");
  });

  test("the other half of the pair reads differently", () => {
    pathname = "/portal/volunteers/roles";
    render(<PortalBreadcrumbs current="Roles" />);
    expect(trail()).toBe("Volunteers › Roles");
  });

  test("carries the record on a three-level route", () => {
    pathname = "/portal/website/articles/abc-123";
    render(<PortalBreadcrumbs current="Getting started" />);
    expect(trail()).toBe("Website › Articles › Getting started");
  });

  test("drops a leaf that repeats its parent", () => {
    // A list page's `current` is the sub-item's own name, and
    // "Finance › Donations › Donations" is noise.
    pathname = "/portal/finance/donations";
    render(<PortalBreadcrumbs current="Donations" />);
    expect(trail()).toBe("Finance › Donations");
  });

  test("every crumb but the last is a link", () => {
    pathname = "/portal/website/articles/abc-123";
    render(<PortalBreadcrumbs current="Getting started" />);
    const nav = within(screen.getByRole("navigation", { name: "Breadcrumb" }));

    expect(nav.getByRole("link", { name: "Website" })).toHaveAttribute(
      "href",
      "/portal/website",
    );
    expect(nav.getByRole("link", { name: "Articles" })).toHaveAttribute(
      "href",
      "/portal/website/articles",
    );
    expect(
      nav.queryByRole("link", { name: "Getting started" }),
    ).not.toBeInTheDocument();
  });

  // The trail replaced a single back link that carried an unsaved-changes
  // prompt, so it has to be interceptable -- and the href is what lets the
  // prompt's "Discard changes" go where the reader was actually going,
  // rather than to the one destination the back link had (#948).
  test("hands each crumb's href to onNavigate, which can stop the click", async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    pathname = "/portal/website/articles/abc-123";

    render(
      <PortalBreadcrumbs
        current="Getting started"
        onNavigate={(href, event) => {
          seen.push(href);
          event.preventDefault();
        }}
      />,
    );

    const nav = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    await user.click(nav.getByRole("link", { name: "Articles" }));
    await user.click(nav.getByRole("link", { name: "Website" }));

    expect(seen).toEqual(["/portal/website/articles", "/portal/website"]);
  });
});
