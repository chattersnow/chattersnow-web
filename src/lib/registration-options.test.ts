import { describe, expect, test } from "bun:test";
import {
  formatOptionCounts,
  hasOptionAnswer,
  optionCountsError,
  parseOptionCounts,
  REGISTRATION_OPTION_ERROR_MESSAGES,
  setOptionCounts,
} from "./registration-options";

describe("optionCountsError (#1407)", () => {
  test("nothing chosen is the required message", () => {
    expect(optionCountsError({ a: 0 }, 2)).toBe(
      REGISTRATION_OPTION_ERROR_MESSAGES.EVENT_OPTIONS_REQUIRED,
    );
  });

  test("a total short of or over the party is the mismatch", () => {
    expect(optionCountsError({ a: 1 }, 2)).toBe(
      REGISTRATION_OPTION_ERROR_MESSAGES.EVENT_OPTIONS_MISMATCH,
    );
    expect(optionCountsError({ a: 2, b: 1 }, 2)).toBe(
      REGISTRATION_OPTION_ERROR_MESSAGES.EVENT_OPTIONS_MISMATCH,
    );
  });

  test("a total equal to the party is fine", () => {
    expect(optionCountsError({ a: 2, b: 1 }, 3)).toBeNull();
  });
});

describe("the FormData round trip", () => {
  test("reads back what was written", () => {
    const formData = new FormData();
    setOptionCounts(formData, { a: 2, b: 0 });
    expect(parseOptionCounts(formData)).toEqual({ a: 2, b: 0 });
  });

  test("no option fields is no answer, not an empty one", () => {
    expect(parseOptionCounts(new FormData())).toBeNull();
  });

  test("a value that is not a count is passed on for the RPC to refuse", () => {
    const formData = new FormData();
    formData.set("optionCount.a", "1.5");
    expect(parseOptionCounts(formData)).toEqual({ a: 1.5 });
  });
});

test("hasOptionAnswer is false for null and all zeros", () => {
  expect(hasOptionAnswer(null)).toBe(false);
  expect(hasOptionAnswer({ a: 0 })).toBe(false);
  expect(hasOptionAnswer({ a: 0, b: 1 })).toBe(true);
});

test("formatOptionCounts reads in the event's order", () => {
  expect(
    formatOptionCounts([
      { option_id: "b", label: "Need a ticket", quantity: 2, sort_order: 1 },
      { option_id: null, label: "Own gear", quantity: 1, sort_order: 0 },
    ]),
  ).toBe("1 × Own gear, 2 × Need a ticket");
});
