import { describe, expect, test } from "bun:test";
import { parseResolutionForm } from "./resolution-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseResolutionForm", () => {
  test("requires motion text", () => {
    expect(parseResolutionForm(formData({}))).toEqual({
      error: "Motion text is required.",
    });
  });

  test("rejects an invalid vote outcome", () => {
    expect(parseResolutionForm(formData({ motionText: "Approve the budget", voteOutcome: "maybe" }))).toEqual({
      error: "Invalid vote outcome.",
    });
  });

  test("defaults vote outcome to pending and effective date to null", () => {
    expect(parseResolutionForm(formData({ motionText: "Approve the budget" }))).toEqual({
      data: { motion_text: "Approve the budget", vote_outcome: "pending", effective_date: null },
    });
  });

  test("parses a passed resolution with an effective date", () => {
    expect(
      parseResolutionForm(
        formData({ motionText: "Approve the budget", voteOutcome: "passed", effectiveDate: "2026-09-01" })
      )
    ).toEqual({
      data: { motion_text: "Approve the budget", vote_outcome: "passed", effective_date: "2026-09-01" },
    });
  });
});
