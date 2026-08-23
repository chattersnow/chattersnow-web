import { describe, expect, test } from "bun:test";
import { parseBoardMemberForm } from "./board-member-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseBoardMemberForm", () => {
  test("requires a role/title", () => {
    expect(parseBoardMemberForm(formData({ termStart: "2026-01-01" }))).toEqual({
      error: "Role/title is required.",
    });
  });

  test("requires a term start date", () => {
    expect(parseBoardMemberForm(formData({ roleTitle: "President" }))).toEqual({
      error: "Term start date is required.",
    });
  });

  test("rejects a term end before the term start", () => {
    expect(
      parseBoardMemberForm(
        formData({ roleTitle: "President", termStart: "2026-01-01", termEnd: "2025-12-31" })
      )
    ).toEqual({ error: "Term end date must be on or after the term start date." });
  });

  test("parses valid input", () => {
    const result = parseBoardMemberForm(
      formData({
        roleTitle: "Treasurer",
        termStart: "2026-01-01",
        termEnd: "2027-12-31",
        isActive: "true",
        notes: "Second term",
      })
    );
    expect(result).toEqual({
      data: {
        role_title: "Treasurer",
        term_start: "2026-01-01",
        term_end: "2027-12-31",
        is_active: true,
        notes: "Second term",
      },
    });
  });

  test("defaults optional fields to null/false", () => {
    const result = parseBoardMemberForm(formData({ roleTitle: "Board Member", termStart: "2026-01-01" }));
    expect(result).toEqual({
      data: {
        role_title: "Board Member",
        term_start: "2026-01-01",
        term_end: null,
        is_active: false,
        notes: null,
      },
    });
  });
});
