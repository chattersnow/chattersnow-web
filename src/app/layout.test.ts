import { describe, expect, mock, test } from "bun:test";
import { DEFAULT_SITE_CONTENT } from "@/lib/site-content";

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
  // the request is for and describes it from site content; the root layout
  // is only the fallback for routes outside it, and the default copy is what
  // the public layout renders for a tenant that has set nothing.
  test("the fallback title and the default description describe the live site", () => {
    expect(metadata.title).toBe("Chatter Snow");
    expect(DEFAULT_SITE_CONTENT.text("org.tagline")).toContain(
      "queer ski and snowboard community",
    );
    expect(DEFAULT_SITE_CONTENT.text("org.tagline")).not.toContain(
      "work in progress",
    );
  });
});
