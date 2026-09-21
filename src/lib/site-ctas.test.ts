import { describe, expect, test } from "bun:test";
import { DEFAULT_SITE_CONTENT } from "./site-content";
import { liveCta, liveCtas, type ContentCta } from "./site-ctas";

const CTA: ContentCta = { label: "Join an event", href: "/events" };

describe("liveCtas", () => {
  test("keeps a row that is on, labelled, publishable and reachable", () => {
    expect(liveCtas([CTA], [])).toEqual([CTA]);
  });

  test("keeps the tenant's order", () => {
    const rows: ContentCta[] = [
      { label: "Donate", href: "/support" },
      { label: "Join an event", href: "/events" },
    ];

    expect(liveCtas(rows, []).map((cta) => cta.href)).toEqual([
      "/support",
      "/events",
    ]);
  });

  // The switch is why a list of buttons is not simply "add and remove rows":
  // a seasonal ask comes back in place rather than being retyped.
  test("drops a row that is switched off, and keeps one switched on", () => {
    expect(liveCtas([{ ...CTA, shown: false }], [])).toEqual([]);
    expect(liveCtas([{ ...CTA, shown: true }], [])).toHaveLength(1);
  });

  // `isListItem()` accepts a row with no `shown` key at all, so that a field
  // added later cannot invalidate a whole slot and send a tenant's buttons
  // back to the registry default. This is the other half of that decision.
  test("a row with no switch reads as shown", () => {
    expect(liveCtas([CTA], [])).toHaveLength(1);
  });

  test("drops a row with no label to put on the button", () => {
    expect(liveCtas([{ ...CTA, label: "   " }], [])).toEqual([]);
  });

  // The editor already refuses these, and `site_content` is still a table an
  // operator can write to directly -- so the page asks again rather than
  // trusting that it was asked once.
  test("drops a destination the site will not publish", () => {
    for (const href of ["javascript:alert(1)", "//evil.test", "", "ftp://x"]) {
      expect(liveCtas([{ ...CTA, href }], []), href).toEqual([]);
    }
  });

  test("accepts an absolute https destination on another host", () => {
    const external = { label: "Try the demo", href: "https://demo.test" };
    expect(liveCtas([external], [])).toEqual([external]);
  });

  describe("against page visibility", () => {
    // The `supportVisible` guard the home page used to write out by hand
    // (#586): a hero button into a section the board has hidden would 404.
    test("drops an internal destination under a hidden section", () => {
      const donate = { label: "Donate", href: "/support" };
      expect(liveCtas([donate], ["support"])).toEqual([]);
      expect(liveCtas([donate], ["events"])).toEqual([donate]);
    });

    // `slotsForHref()` matches on segment boundaries, so a hidden section
    // takes its own pages with it.
    test("drops a destination inside a hidden section's pages", () => {
      const sizing = { label: "Sizing", href: "/inventory/sizing" };
      expect(liveCtas([sizing], ["gears-sizing"])).toEqual([]);
      expect(liveCtas([sizing], ["gears"])).toEqual([]);
    });

    // An external host matches no slot, so no board decision can reach it --
    // which is the honest answer: page visibility governs this site's
    // sections, not somebody else's.
    test("leaves an external destination alone whatever is hidden", () => {
      const demo = { label: "Try the demo", href: "https://demo.test" };
      expect(liveCtas([demo], ["support", "events", "audiences"])).toEqual([
        demo,
      ]);
    });
  });
});

/**
 * The equivalence #1327 turns on: `home.ctas` replaced three hardcoded buttons,
 * and no tenant that never opened the slot may notice.
 */
describe("the home hero's default buttons", () => {
  const defaults = DEFAULT_SITE_CONTENT.list<ContentCta>("home.ctas");

  test("are the three buttons the page used to hardcode", () => {
    expect(defaults).toEqual([
      { label: "Join an event", href: "/events", shown: true },
      { label: "Get involved", href: "/get-involved", shown: true },
      { label: "Donate", href: "/support", shown: true },
    ]);
  });

  test("render in the same order, and Donate still follows Support", () => {
    expect(liveCtas(defaults, []).map((cta) => cta.href)).toEqual([
      "/events",
      "/get-involved",
      "/support",
    ]);
    expect(liveCtas(defaults, ["support"]).map((cta) => cta.href)).toEqual([
      "/events",
      "/get-involved",
    ]);
  });
});

/**
 * The marketing pages ship with no buttons at all (#1328, #1329), which is
 * deliberate: a destination is the one thing a registry default cannot honestly
 * guess -- it is a host, and hosts belong to whoever runs the deployment.
 */
describe("the marketing pages' buttons", () => {
  test("are empty until a tenant writes one", () => {
    for (const page of [
      "audience_nonprofits",
      "audience_business",
      "module_tour",
    ]) {
      expect(DEFAULT_SITE_CONTENT.list(`${page}.ctas`), page).toEqual([]);
    }
  });
});

/**
 * `liveCta` is the same three questions asked of a button that is not in a
 * list: a plan card's, on `/pricing` (#1330). Worth its own tests because the
 * price list is the one page where a dropped button and a rendered one look
 * equally plausible -- a plan whose sign-up is a conversation has no button at
 * all -- so a `javascript:` row slipping through would not look wrong.
 */
describe("liveCta", () => {
  test("passes a publishable destination through", () => {
    expect(liveCta({ label: "Get started", href: "/contact" }, [])).toEqual({
      label: "Get started",
      href: "/contact",
    });
  });

  test("drops a row with no button on it", () => {
    expect(liveCta(null, [])).toBeNull();
    expect(liveCta({ label: "", href: "/contact" }, [])).toBeNull();
  });

  test("drops a destination in a section the board has hidden", () => {
    expect(
      liveCta({ label: "Donate", href: "/support" }, ["support"]),
    ).toBeNull();
  });

  test("drops a scheme the site will not publish", () => {
    expect(
      liveCta({ label: "Sign up", href: "javascript:alert(1)" }, []),
    ).toBeNull();
  });
});
