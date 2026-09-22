import { describe, expect, test } from "bun:test";
import {
  INSTAGRAM_HANDLE_ERROR,
  parseInstagramHandle,
} from "./instagram-handle";

describe("parseInstagramHandle", () => {
  test("treats nothing typed as nothing given", () => {
    expect(parseInstagramHandle(null)).toEqual({ instagramHandle: null });
    expect(parseInstagramHandle("   ")).toEqual({ instagramHandle: null });
  });

  test("strips the @ people write and the space around it", () => {
    expect(parseInstagramHandle("  @jane.doe ")).toEqual({
      instagramHandle: "jane.doe",
    });
  });

  test("accepts the characters the column's check constraint accepts", () => {
    expect(parseInstagramHandle("a_b.c123")).toEqual({
      instagramHandle: "a_b.c123",
    });
    expect(parseInstagramHandle("x".repeat(30))).toEqual({
      instagramHandle: "x".repeat(30),
    });
  });

  test("refuses what Postgres would refuse", () => {
    // Over the 30-character cap, and containing characters the constraint
    // does not allow -- either one would fail the insert mid-submission.
    expect(parseInstagramHandle("x".repeat(31))).toEqual({
      error: INSTAGRAM_HANDLE_ERROR,
    });
    expect(parseInstagramHandle("jane doe")).toEqual({
      error: INSTAGRAM_HANDLE_ERROR,
    });
    expect(parseInstagramHandle("jane@doe")).toEqual({
      error: INSTAGRAM_HANDLE_ERROR,
    });
  });
});
