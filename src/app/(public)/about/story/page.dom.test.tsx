import { describe, expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";

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

// StoryPage only needs a Supabase client to look up site image URLs, so
// stub the server client factory rather than pulling in real cookies/env
// (same approach as the portal dom tests that fake Supabase directly).
mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: async () => ({
        data: [
          {
            slot: "about_story_photo",
            value: "https://cdn.example.com/story.jpg",
          },
        ],
      }),
    }),
  }),
}));

const { default: StoryPage } = await import("./page");

describe("StoryPage", () => {
  test("renders Our Story image beside the copy in a shared grid instead of floated inside it", async () => {
    const { container } = render(await StoryPage());

    const storyHeading = Array.from(container.querySelectorAll("h2")).find(
      (heading) => heading.textContent === "Our Story",
    );
    expect(storyHeading).toBeDefined();

    const storySection = storyHeading!.closest("section");
    expect(storySection).not.toBeNull();
    expect(storySection!.className).toContain("grid");

    const image = storySection!.querySelector("img");
    expect(image).not.toBeNull();
    // The image must not be nested inside the narrow max-w-3xl copy column.
    expect(image!.closest(".max-w-3xl")).toBeNull();
    // Nor float inside it (the old cramped layout).
    const floatedAncestor = image!.closest('[class*="float-right"]');
    expect(floatedAncestor).toBeNull();
  });

  test("keeps the intro paragraph readable-width without constraining the whole page", async () => {
    const { container } = render(await StoryPage());

    const intro = container.querySelector(".max-w-3xl");
    expect(intro).not.toBeNull();
    expect(intro!.textContent).toContain("queer ski and snowboard community");
  });
});
