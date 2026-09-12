// happy-dom fetches nothing, so every <img> in here reports `complete` with a
// `naturalWidth` of 0 -- exactly what a real browser reports for a logo whose
// host is gone, and what `SponsorTile` reads on mount to catch a hotlink that
// died before React attached `onError`. Every tile therefore renders its name
// fallback under this DOM, which is what these assert; that a live logo still
// renders as an image is a browser-level fact, covered by the e2e/a11y runs
// against a real Chromium.
import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SponsorTile, SponsorWall } from "./sponsor-wall";

const sponsor = {
  sponsor_id: "s1",
  name: "Summit Outdoor Co.",
  logo_url: "https://example.test/logo.png",
  website: "https://example.test",
};

describe("SponsorTile", () => {
  test("links a sponsor to their website in a new tab", () => {
    render(<SponsorTile sponsor={sponsor} />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://example.test");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test("renders the name where there is no logo", () => {
    render(<SponsorTile sponsor={{ ...sponsor, logo_url: null }} />);

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("Summit Outdoor Co.")).toBeInTheDocument();
  });

  // A sponsor with no website is a plain tile rather than a dead link.
  test("renders no link for a sponsor with no website", () => {
    render(<SponsorTile sponsor={{ ...sponsor, website: null }} />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Summit Outdoor Co.")).toBeInTheDocument();
  });

  // The broken-image icon and the alt text is what /support/sponsorship showed
  // before #914 read the element on mount: the hotlink fails while the page is
  // still server-rendered markup, so `onError` never fires.
  test("falls back to the name for a logo that failed before hydration", () => {
    render(<SponsorTile sponsor={sponsor} />);

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText("Summit Outdoor Co.")).toBeInTheDocument();
  });
});

describe("SponsorWall", () => {
  test("renders one tile per sponsor", () => {
    render(
      <SponsorWall
        sponsors={[
          sponsor,
          { ...sponsor, sponsor_id: "s2", name: "Summit Threads" },
        ]}
      />,
    );

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("Summit Threads")).toBeInTheDocument();
  });
});
