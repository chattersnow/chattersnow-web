import { describe, expect, test } from "bun:test";
import {
  attendedBeforeLabel,
  attendedBeforeValue,
  countSelfReportedFirstTimers,
  hasAnyAttendedBeforeAnswer,
  parseAttendedBefore,
} from "./attended-before";

describe("parseAttendedBefore", () => {
  test("reads the two answers the form offers", () => {
    expect(parseAttendedBefore("yes")).toBe(true);
    expect(parseAttendedBefore("no")).toBe(false);
  });

  // The whole point of the column is that these three are the same state and
  // none of them is "no": a blank select, a form posted without the field, and
  // a value nobody was offered all mean the question went unanswered.
  test("treats blank, absent and unrecognised alike as unanswered", () => {
    expect(parseAttendedBefore("")).toBe(null);
    expect(parseAttendedBefore("   ")).toBe(null);
    expect(parseAttendedBefore(null)).toBe(null);
    expect(parseAttendedBefore("maybe")).toBe(null);
    expect(parseAttendedBefore("true")).toBe(null);
  });
});

describe("attendedBeforeValue", () => {
  test("round-trips through the select's value", () => {
    expect(parseAttendedBefore(attendedBeforeValue(true))).toBe(true);
    expect(parseAttendedBefore(attendedBeforeValue(false))).toBe(false);
    expect(parseAttendedBefore(attendedBeforeValue(null))).toBe(null);
  });
});

describe("attendedBeforeLabel", () => {
  test("names both answers and leaves the third to the caller", () => {
    expect(attendedBeforeLabel(true)).toBe("Been before");
    expect(attendedBeforeLabel(false)).toBe("First time");
    expect(attendedBeforeLabel(null)).toBe(null);
  });
});

describe("countSelfReportedFirstTimers", () => {
  // The bug this exists to prevent: counting `!attended_before` would sweep
  // every unanswered row into the first-timer figure, which before this
  // shipped is every row there is.
  test("counts only the people who said no, never the ones who said nothing", () => {
    expect(
      countSelfReportedFirstTimers([
        { attended_before: false },
        { attended_before: false },
        { attended_before: true },
        { attended_before: null },
        { attended_before: null },
      ]),
    ).toBe(2);
  });

  test("is zero when nobody answered", () => {
    expect(
      countSelfReportedFirstTimers([
        { attended_before: null },
        { attended_before: null },
      ]),
    ).toBe(0);
  });
});

describe("hasAnyAttendedBeforeAnswer", () => {
  test("is false for an event whose registrants all predate the question", () => {
    expect(
      hasAnyAttendedBeforeAnswer([
        { attended_before: null },
        { attended_before: null },
      ]),
    ).toBe(false);
    expect(hasAnyAttendedBeforeAnswer([])).toBe(false);
  });

  // A single "yes" is enough: the column is worth its width as soon as one row
  // has something in it.
  test("is true once anyone has answered either way", () => {
    expect(
      hasAnyAttendedBeforeAnswer([
        { attended_before: null },
        { attended_before: true },
      ]),
    ).toBe(true);
    expect(hasAnyAttendedBeforeAnswer([{ attended_before: false }])).toBe(true);
  });
});
