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

/**
 * Every <img> reports a failed load under happy-dom (see the note at the top),
 * which is exactly what the fallback tests above want and exactly what a test
 * about the `src` an <img> is handed cannot have. Pinning `complete` to false
 * for the duration keeps the element mounted so its attributes can be read.
 */
function withLoadingImages(fn: () => void) {
  const original = Object.getOwnPropertyDescriptor(
    HTMLImageElement.prototype,
    "complete",
  );
  Object.defineProperty(HTMLImageElement.prototype, "complete", {
    configurable: true,
    get: () => false,
  });
  try {
    fn();
  } finally {
    if (original) {
      Object.defineProperty(HTMLImageElement.prototype, "complete", original);
    } else {
      Reflect.deleteProperty(HTMLImageElement.prototype, "complete");
    }
  }
}

// #914 handed the stored URL straight to <img>. A Google Drive share link --
// what the portal's picture fields are most often filled with, and what every
// other image surface resolves -- points at Drive's HTML viewer rather than
// the image bytes, so a wall of Drive-hosted logos rendered as a wall of names.
test("rewrites a Google Drive share link to the image itself", () => {
  withLoadingImages(() => {
    render(
      <SponsorTile
        sponsor={{
          ...sponsor,
          logo_url: "https://drive.google.com/file/d/ABC123/view",
        }}
      />,
    );

    expect(document.querySelector("img")?.getAttribute("src")).toBe(
      "https://drive.google.com/thumbnail?id=ABC123&sz=w1000",
    );
  });
});

const sponsors = [
  sponsor,
  { ...sponsor, sponsor_id: "s2", name: "Summit Threads" },
];

describe("SponsorWall", () => {
  test("renders one tile per sponsor", () => {
    render(<SponsorWall sponsors={sponsors} />);

    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("Summit Threads")).toBeInTheDocument();
  });

  // #1013: a tenant that has chosen nothing keeps the tile grid the section
  // has had since #914, so the prop has to be optional and default to cards.
  test("is the tile grid when no layout is given", () => {
    const { container } = render(<SponsorWall sponsors={sponsors} />);

    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(2);
  });

  test("drops the cards in the band", () => {
    const { container } = render(
      <SponsorWall sponsors={sponsors} layout="band" />,
    );

    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText("Summit Threads")).toBeInTheDocument();
  });

  test("keeps the sponsor's link in the band", () => {
    render(<SponsorWall sponsors={[sponsor]} layout="band" />);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://example.test");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  // The same two fallbacks SponsorTile is asserted on above, since the band
  // renders the marks without the card rather than a second implementation.
  test("keeps the name fallback and the plain mark in the band", () => {
    render(
      <SponsorWall
        sponsors={[
          { ...sponsor, logo_url: null },
          {
            ...sponsor,
            sponsor_id: "s2",
            name: "Summit Threads",
            website: null,
          },
        ]}
        layout="band"
      />,
    );

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByText("Summit Outdoor Co.")).toBeInTheDocument();
    expect(screen.getByText("Summit Threads")).toBeInTheDocument();
  });

  // Nothing to render is the caller's call either way: the heading and intro
  // above the wall are tenant-owned copy, so the page gates the whole section.
  test("renders no empty state in either layout", () => {
    const cards = render(<SponsorWall sponsors={[]} />);
    expect(cards.container.textContent).toBe("");

    const band = render(<SponsorWall sponsors={[]} layout="band" />);
    expect(band.container.textContent).toBe("");
  });
});
