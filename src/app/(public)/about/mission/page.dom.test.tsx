import { describe, expect, mock, test } from "bun:test";
import { DEFAULT_SITE_CONTENT } from "@/lib/site-content";
import { render } from "@testing-library/react";
import { fakePublicSiteClient } from "../../../../../test/fake-public-site-client";

// next/image's getImgProps parses `src` through `new URL()`, which throws in
// happy-dom for the relative/placeholder sources these tests don't care
// about; swap in a plain <img> so the DOM structure around it is still
// assertable.
mock.module("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: unknown;
    alt: string;
    className?: string;
  }) => (
    <img
      src={typeof src === "string" ? src : ""}
      alt={alt}
      className={className}
    />
  ),
}));

// MissionPage only needs a Supabase client to look up site image URLs, so
// stub the server client factory rather than pulling in real cookies/env.
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () =>
    fakePublicSiteClient({
      siteImages: {
        about_mission_photo: "https://cdn.example.com/mission.jpg",
      },
    }),
}));

const { default: MissionPage } = await import("./page");

describe("MissionPage", () => {
  test("pairs the mission photo with the (taller) mission statement, not the short values list", async () => {
    const { container } = render(await MissionPage());

    const missionSection = container.querySelector("#mission");
    expect(missionSection).not.toBeNull();
    expect(missionSection!.querySelector("img")).not.toBeNull();

    const valuesSection = container.querySelector("#values");
    expect(valuesSection).not.toBeNull();
    expect(valuesSection!.querySelector("img")).toBeNull();
  });

  test("keeps Our Values as a plain full-width list instead of a grid row with the image", async () => {
    const { container } = render(await MissionPage());

    const valuesSection = container.querySelector("#values");
    expect(valuesSection).not.toBeNull();
    // The values list no longer shares a grid row with the (much taller)
    // mission photo, so it shouldn't carry the grid layout that caused the
    // row height (and the gap after it) to be driven by the image.
    expect(valuesSection!.className).not.toContain("grid");

    const list = valuesSection!.querySelector("ul");
    expect(list).not.toBeNull();
    // Whatever the slot says, not a value name from one organization's copy:
    // the defaults became prompts in #795 Phase 3, and this test is about the
    // layout the list is given, not the words in it.
    expect(list!.textContent).toContain(
      DEFAULT_SITE_CONTENT.list<{ name: string }>("about_mission.values")[0]
        .name,
    );
  });

  test("keeps Why LGBTQ+ immediately after Values in document order", async () => {
    const { container } = render(await MissionPage());

    const sectionIds = Array.from(container.querySelectorAll("section")).map(
      (section) => section.id,
    );
    expect(sectionIds.indexOf("why-lgbtq")).toBe(
      sectionIds.indexOf("values") + 1,
    );
  });
});
