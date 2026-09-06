import { describe, expect, test } from "bun:test";
import { parseDecisionForm } from "./decision-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validFields = {
  description: "  Approved the 2026 equipment budget.  ",
  decisionDate: "2026-03-14",
  topic: "  Budget  ",
  voteResult: "  5-0  ",
};

describe("parseDecisionForm", () => {
  test("parses a fully filled form", () => {
    expect(parseDecisionForm(formData(validFields))).toEqual({
      data: {
        description: "Approved the 2026 equipment budget.",
        decision_date: "2026-03-14",
        topic: "Budget",
        vote_result: "5-0",
      },
    });
  });

  test("turns a blank topic and vote result into null", () => {
    const result = parseDecisionForm(
      formData({ ...validFields, topic: "  ", voteResult: "" }),
    );
    expect("data" in result && result.data).toMatchObject({
      topic: null,
      vote_result: null,
    });
  });

  test("requires a description", () => {
    expect(
      parseDecisionForm(formData({ ...validFields, description: "   " })),
    ).toEqual({ error: "Description is required." });
  });

  test("requires a decision date", () => {
    expect(
      parseDecisionForm(formData({ ...validFields, decisionDate: "" })),
    ).toEqual({ error: "Decision date is required." });
  });

  test("treats an entirely empty form as a missing description", () => {
    expect(parseDecisionForm(new FormData())).toEqual({
      error: "Description is required.",
    });
  });
});
