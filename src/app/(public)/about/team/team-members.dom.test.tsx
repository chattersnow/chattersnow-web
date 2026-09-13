import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next/image's getImgProps parses `src` through `new URL()`, which throws in
// happy-dom for the placeholder sources these tests don't care about.
mock.module("next/image", () => ({
  default: ({ src, alt }: { src: unknown; alt: string }) => (
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

const { TeamMembers } = await import("./team-members");

const PLACEHOLDER = "Bio coming soon.";

/** Five paragraphs, ~1,200 characters: the length #917 was opened about. */
const LONG_BIO = [
  "I have been riding for four years and learned as an adult, which is hard work I enjoy every second of.",
  "This organization came out of frustration with what I kept seeing on mountain pride posts, and what I heard in lift lines.",
  "When I am not putting on events you can usually find me volunteering on snow with three other groups across the region.",
  "Off snow, I play saxophone, surf, draw, climb, and read comics, and I have made friends here I share all of that with.",
  "If you are reading this and are not sure where to start, show up to an event. You will not leave without a new friend.",
];

const SHORT_BIO = ["Rides most weekends."];

function member(overrides: Record<string, unknown> = {}) {
  return {
    name: "Sofie Chavez",
    photo_url: "",
    photo_slot: "",
    bio: LONG_BIO,
    ...overrides,
  };
}

function renderTeam(
  layout: "cards" | "rows",
  members: ReturnType<typeof member>[],
) {
  return render(
    <TeamMembers
      members={members}
      siteImages={{}}
      layout={layout}
      bioPlaceholder={PLACEHOLDER}
    />,
  );
}

describe("TeamMembers", () => {
  test("renders the card grid by default and the roster rows when asked", () => {
    const { container: cards } = renderTeam("cards", [member()]);
    expect(cards.querySelector("ul")).toBeNull();
    expect(cards.querySelector(".lg\\:grid-cols-3")).not.toBeNull();

    const { container: rows } = renderTeam("rows", [member()]);
    expect(rows.querySelectorAll("li")).toHaveLength(1);
    expect(rows.querySelector(".lg\\:grid-cols-3")).toBeNull();
  });

  test("shows a role in both layouts, and nothing when a member has none", () => {
    for (const layout of ["cards", "rows"] as const) {
      const { container, unmount } = renderTeam(layout, [
        member({ role: "Co-founder" }),
        member({ name: "Cass Lainez" }),
      ]);
      expect(screen.getByText("Co-founder")).toBeInTheDocument();
      // One role line for two members: the one without a role renders none
      // rather than an empty line holding space.
      expect(container.querySelectorAll(".app-eyebrow")).toHaveLength(1);
      unmount();
    }
  });

  // The criterion the whole clamp approach exists to satisfy: clipping is CSS,
  // so the words are on the page for a crawler and for a reader without
  // JavaScript whether or not anyone has pressed anything.
  test("puts every paragraph of a long bio in the markup while it is clipped", () => {
    const { container } = renderTeam("rows", [member()]);

    for (const paragraph of LONG_BIO) {
      expect(screen.getByText(paragraph)).toBeInTheDocument();
    }
    expect(container.querySelector(".line-clamp-3")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /Read more about Sofie Chavez/ }),
    ).toBeInTheDocument();
  });

  test("expands in place and collapses again", async () => {
    const user = userEvent.setup();
    const { container } = renderTeam("rows", [member()]);

    const readMore = screen.getByRole("button", { name: /Read more/ });
    expect(readMore).toHaveAttribute("aria-expanded", "false");

    await user.click(readMore);

    const showLess = screen.getByRole("button", { name: /Show less/ });
    expect(showLess).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".line-clamp-3")).toBeNull();
    // Still the same paragraphs, not a second copy fetched on demand.
    expect(screen.getAllByText(LONG_BIO[4])).toHaveLength(1);

    await user.click(showLess);
    expect(
      screen.getByRole("button", { name: /Read more/ }),
    ).toBeInTheDocument();
  });

  test("leaves a short bio unclipped and gives it no expander", () => {
    const { container } = renderTeam("rows", [member({ bio: SHORT_BIO })]);

    expect(screen.getByText(SHORT_BIO[0])).toBeInTheDocument();
    expect(container.querySelector(".line-clamp-3")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  // Chatter Snow has a member in exactly this shape, so it is the live case.
  test("rows render a member with no bio as name and role only", () => {
    renderTeam("rows", [
      member({ name: "Cass Lainez", bio: [], role: "Lead" }),
    ]);

    expect(screen.getByText("Cass Lainez")).toBeInTheDocument();
    expect(screen.getByText("Lead")).toBeInTheDocument();
    expect(screen.queryByText(PLACEHOLDER)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("cards keep the placeholder for a member with no bio", () => {
    renderTeam("cards", [member({ bio: [] })]);

    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
  });
});
