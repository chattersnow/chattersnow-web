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
function mockClient(layout: Record<string, unknown>) {
  mock.module("@/lib/supabase/server", () => ({
    createSupabaseServerClient: async () => fakePublicSiteClient({ layout }),
  }));
}

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
});
