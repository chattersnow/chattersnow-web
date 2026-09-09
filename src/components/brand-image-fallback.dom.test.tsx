import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
// next/image parses `src` through `new URL()` at render, which happy-dom
// refuses -- the house workaround, same as brand/page.dom.test.tsx. What this
// file asserts is *whether* an image is requested and whose it is, which
// survives the substitution intact.
mock.module("next/image", () => ({
  default: ({ src, alt }: { src: unknown; alt: string }) => (
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

import { BrandImageFallback } from "./brand-image-fallback";
import { BrandLogoProvider } from "./brand-logo-context";

describe("BrandImageFallback", () => {
  test("wears the tenant's own logo where they have set one", () => {
    render(
      <BrandLogoProvider logoUrl="https://drive.google.com/thumbnail?id=demo-mark&sz=w1000">
        <BrandImageFallback label="Flier coming soon" />
      </BrandLogoProvider>,
    );

    const image = document.querySelector("img");
    expect(image).not.toBeNull();
    expect(image!.getAttribute("src")).toContain("demo-mark");
    expect(screen.getByText("Flier coming soon")).toBeInTheDocument();
  });

  // The bug this component had: a tenant with no logo of its own got the
  // drawn mark in the header and Chatter Snow's actual logo in every flier
  // and gear tile. No image at all is the correct render here.
  test("fetches no image for a tenant that has set none", () => {
    render(
      <BrandLogoProvider logoUrl={null}>
        <BrandImageFallback label="Photo coming soon" />
      </BrandLogoProvider>,
    );

    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("svg")).not.toBeNull();
  });

  test("borrows nobody's mark when no provider is above it", () => {
    render(<BrandImageFallback />);

    expect(document.querySelector("img")).toBeNull();
  });
});

/**
 * `/chatter-logo-transparent.png` is in `public/` because Chatter Snow sets it
 * as its own `brand.logo_url`, and for no other reason. #795 Phase 3 stopped
 * `BrandLogo` shipping it as every tenant's default but left it hardcoded in
 * `BrandImageFallback`, where it survived for exactly as long as nobody looked
 * at a second tenant's gear library. Nothing in `src/` may name it again.
 */
describe("Chatter Snow's logo file", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sources(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  test("is referenced by no component", () => {
    const offenders = sources(join(import.meta.dirname, "..")).filter((path) =>
      // The login and set-password pages mention the filename in a comment
      // recording that it used to be hardcoded there; a `src=` is the thing
      // that puts it on a page.
      /src=["'{`]?\/chatter-logo/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
