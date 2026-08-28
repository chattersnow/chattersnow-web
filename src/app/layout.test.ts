import { describe, expect, mock, test } from "bun:test";

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
    expect(metadata.description).not.toContain("work in progress");
  });

  test("title and description describe the live site", () => {
    expect(metadata.title).toBe("Chatter Snow");
    expect(metadata.description).toContain("queer ski and snowboard community");
  });
});
