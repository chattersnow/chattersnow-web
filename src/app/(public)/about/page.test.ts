import { describe, expect, mock, test } from "bun:test";

const redirectMock = mock(() => {});
mock.module("next/navigation", () => ({ redirect: redirectMock }));

const { default: AboutPage } = await import("./page");

describe("AboutPage", () => {
  test("redirects to Our Story instead of duplicating its content", () => {
    AboutPage();

    expect(redirectMock).toHaveBeenCalledWith("/about/story");
  });
});
