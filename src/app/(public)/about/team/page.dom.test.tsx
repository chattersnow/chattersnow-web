import { describe, expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";
import { fakePublicSiteClient } from "../../../../../test/fake-public-site-client";

mock.module("next/image", () => ({
  default: ({ src, alt }: { src: unknown; alt: string }) => (
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

/**
 * Which arrangement the page asks for, given what the tenant has stored.
 *
 * The arrangements themselves are covered in `team-members.dom.test.tsx`,
 * against the component and its props; this file is only about the wiring in
 * between -- that `layout.team_layout` actually reaches the page, and that a
 * tenant who has chosen nothing keeps the card grid (#917).
 */
function mockClient(
  layout: Record<string, unknown>,
  publicTeam: NonNullable<
    Parameters<typeof fakePublicSiteClient>[0]
  >["publicTeam"] = [],
) {
  mock.module("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () =>
      fakePublicSiteClient({ layout, publicTeam }),
  }));
}

/** What `public_team` would answer for a tenant that has listed two people. */
const PEOPLE = [
  {
    name: "Rowan Person",
    role: "Programs lead",
    bio: "First paragraph.\n\nSecond paragraph.",
  },
  // The live shape a bio-less person has: a null column, not an empty one.
  { name: "Sky Person", role: null, bio: null },
];

describe("TeamPage", () => {
  test("renders the card grid when the tenant has chosen no layout", async () => {
    mockClient({});
    const { default: TeamPage } = await import("./page");

    const { container } = render(await TeamPage());

    expect(container.querySelector(".lg\\:grid-cols-3")).not.toBeNull();
    expect(container.querySelector("ul")).toBeNull();
  });

  test("renders roster rows when the tenant has chosen them", async () => {
    mockClient({ team_layout: "rows" });
    const { default: TeamPage } = await import("./page");

    const { container } = render(await TeamPage());

    expect(container.querySelector("ul")).not.toBeNull();
    expect(container.querySelector(".lg\\:grid-cols-3")).toBeNull();
  });

  test("renders the portrait grid when the tenant has chosen it", async () => {
    mockClient({ team_layout: "portraits" });
    const { default: TeamPage } = await import("./page");

    const { container } = render(await TeamPage());

    expect(container.querySelector(".lg\\:grid-cols-5")).not.toBeNull();
    expect(container.querySelector(".lg\\:grid-cols-3")).toBeNull();
  });

  // Where the members come from (#1014). The seam is one branch in the page,
  // so this is the wiring test for it: the setting decides, not the data.
  test("renders the copy, not the people rows, until a tenant chooses People", async () => {
    mockClient({}, PEOPLE);
    const { default: TeamPage } = await import("./page");

    const { getByText, queryByText } = render(await TeamPage());

    expect(getByText("Team member name")).not.toBeNull();
    expect(queryByText("Rowan Person")).toBeNull();
  });

  test("renders the people rows in the chosen arrangement when the tenant chooses People", async () => {
    mockClient({ team_source: "people", team_layout: "rows" }, PEOPLE);
    const { default: TeamPage } = await import("./page");

    const { container, getByText, queryByText } = render(await TeamPage());

    expect(container.querySelector("ul")).not.toBeNull();
    expect(getByText("Rowan Person")).not.toBeNull();
    expect(getByText("Programs lead")).not.toBeNull();
    expect(getByText("First paragraph.")).not.toBeNull();
    expect(getByText("Second paragraph.")).not.toBeNull();
    // A person with no bio still renders, as a copy row without one does.
    expect(getByText("Sky Person")).not.toBeNull();
    expect(queryByText("Team member name")).toBeNull();
  });

  test("People mode with nobody listed shows the empty copy, not an empty grid", async () => {
    mockClient({ team_source: "people" }, []);
    const { default: TeamPage } = await import("./page");

    const { container, getByText } = render(await TeamPage());

    expect(
      getByText("We're updating this page. Check back soon."),
    ).not.toBeNull();
    expect(container.querySelector(".lg\\:grid-cols-3")).toBeNull();
  });
});
