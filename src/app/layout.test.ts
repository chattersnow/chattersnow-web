import { describe, expect, mock, test } from "bun:test";
import { DEFAULT_SITE_CONTENT } from "@/lib/site-content";
import { PLATFORM_TITLE } from "@/lib/public-site";

// layout.tsx pulls in font loaders, analytics, and global CSS that only
// resolve inside a real Next.js build — stub them so `metadata` (a plain
// object, unrelated to any of that) can be imported and asserted on here.
mock.module("next/font/google", () => ({
  Quicksand: () => ({ variable: "--font-quicksand" }),
  Rock_Salt: () => ({ variable: "--font-rock-salt" }),
}));
mock.module("@vercel/analytics/next", () => ({ Analytics: () => null }));
mock.module("./globals.css", () => ({}));

const { metadata } = await import("./layout");

describe("root layout metadata", () => {
  test("no longer advertises the site as coming soon", () => {
    expect(metadata.title).not.toContain("Coming soon");
  });

  // Since #707 Phase 4 the public layout's generateMetadata names the tenant
  // the request is for and describes it from site content; the root layout is
  // only the fallback for routes outside it.
  //
  // #795 Phase 4 changed what that fallback says. It was Chatter Snow's name,
  // so a host resolving to no tenant -- where every path 404s -- still carried
  // one organization's name in the tab of another organization's domain. The
  // assertion is the property, not the string: no organization here, ever.
  test("the fallback title names no organization", () => {
    expect(metadata.title).toBe(PLATFORM_TITLE);
    expect(String(metadata.title)).not.toMatch(/chatter/i);
  });

  // Empty would be the most neutral fallback of all, and is not an option:
  // axe's document-title rule fails a page without one, and test:a11y:check
  // enforces it.
  test("the fallback title is not empty", () => {
    expect(String(metadata.title).trim().length).toBeGreaterThan(0);
  });

  // The public layout still renders this for a tenant that has set nothing of
  // its own -- but since #795 Phase 3 what it renders is a prompt rather than
  // one organization's description. It has to stay a usable sentence either
  // way: it is the meta description, so an empty one is a real defect and a
  // long one is truncated in search results.
  test("the default description is a usable sentence that names nobody", () => {
    const tagline = DEFAULT_SITE_CONTENT.text("org.tagline");
    expect(tagline.trim().length).toBeGreaterThan(20);
    expect(tagline.length).toBeLessThan(160);
    expect(tagline).not.toMatch(/chatter/i);
  });
});
