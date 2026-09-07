import { describe, expect, test } from "bun:test";
import { parseRetentionParams } from "./retention-params";

describe("parseRetentionParams", () => {
  test("starts on the first page when the URL says nothing", () => {
    expect(parseRetentionParams({})).toEqual({ page: 1 });
  });

  test("reads a page number", () => {
    expect(parseRetentionParams({ page: "4" })).toEqual({ page: 4 });
  });

  test("takes the first value when the page is repeated", () => {
    expect(parseRetentionParams({ page: ["2", "7"] })).toEqual({ page: 2 });
  });

  test("clamps a nonsensical page back to the first one", () => {
    expect(parseRetentionParams({ page: "0" }).page).toBe(1);
    expect(parseRetentionParams({ page: "-3" }).page).toBe(1);
    expect(parseRetentionParams({ page: "last" }).page).toBe(1);
  });
});
