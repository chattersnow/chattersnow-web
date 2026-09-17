// `notes` goes into a jsonb column that the save RPC merges with `||`, so
// whatever gets past this parser is stored verbatim and read back as a
// section's notes. `agenda-form.ts` already documents what that costs when it
// is not checked -- `ongoingItems="hi"` wrote a bare string into jsonb -- and
// this is the same column family.
import { describe, expect, test } from "bun:test";
import { parseMinutesPatch } from "./minutes-form";

const NOTES_REFUSAL = "Could not read the meeting notes. Please try again.";

describe("parseMinutesPatch", () => {
  test("takes a flat record of strings", () => {
    expect(
      parseMinutesPatch({
        notes: { "section:finance_fundraising": "Approved the budget." },
      }),
    ).toEqual({
      data: {
        notes: { "section:finance_fundraising": "Approved the budget." },
      },
    });
  });

  test("an empty patch is a patch, not a refusal", () => {
    expect(parseMinutesPatch({})).toEqual({ data: { notes: {} } });
  });

  test("refuses anything that is not a flat record of strings", () => {
    const refusal = { error: NOTES_REFUSAL, field: "notes" };
    expect(parseMinutesPatch({ notes: "hi" })).toEqual(refusal);
    expect(parseMinutesPatch({ notes: ["hi"] })).toEqual(refusal);
    expect(parseMinutesPatch({ notes: null })).toEqual(refusal);
    expect(parseMinutesPatch({ notes: { opening: 42 } })).toEqual(refusal);
    expect(parseMinutesPatch({ notes: { opening: null } })).toEqual(refusal);
    expect(parseMinutesPatch({ notes: { opening: ["a"] } })).toEqual(refusal);
    // Nested objects are the shape that would read back as "[object Object]".
    expect(parseMinutesPatch({ notes: { opening: { text: "a" } } })).toEqual(
      refusal,
    );
    expect(parseMinutesPatch({ notes: { "  ": "a" } })).toEqual(refusal);
  });

  test("distinguishes closing notes left alone from closing notes cleared", () => {
    // Absent: the autosave sent only note keys, and body_text must not move.
    const untouched = parseMinutesPatch({ notes: { opening: "Quorum met." } });
    expect("data" in untouched && "body_text" in untouched.data).toBe(false);

    // Set to empty: the notetaker deleted them on purpose.
    expect(parseMinutesPatch({ bodyText: "" })).toEqual({
      data: { notes: {}, body_text: "" },
    });
    expect(parseMinutesPatch({ bodyText: null })).toEqual({
      data: { notes: {}, body_text: null },
    });
    expect(parseMinutesPatch({ bodyText: "Closed at 19:40." })).toEqual({
      data: { notes: {}, body_text: "Closed at 19:40." },
    });
  });

  test("an explicit undefined is absent, not a clear", () => {
    const result = parseMinutesPatch({ bodyText: undefined });
    expect(result).toEqual({ data: { notes: {} } });
    expect("data" in result && "body_text" in result.data).toBe(false);
  });

  test("refuses closing notes that are not text", () => {
    expect(parseMinutesPatch({ bodyText: 42 })).toEqual({
      error: "Could not read the closing notes. Please try again.",
      field: "bodyText",
    });
  });
});
