import { describe, expect, test } from "bun:test";
import { parsePartnershipOpportunityForm } from "./partnership-opportunity-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parsePartnershipOpportunityForm", () => {
  test("rejects an invalid stage", () => {
    const result = parsePartnershipOpportunityForm(
      formData({ stage: "bogus" }),
    );
    expect(result).toEqual({ error: "Invalid stage." });
  });

  test("defaults stage to prospecting and blanks optional fields to null", () => {
    const result = parsePartnershipOpportunityForm(formData({}));
    expect(result).toEqual({
      data: {
        stage: "prospecting",
        next_step_date: null,
        notes: null,
      },
    });
  });

  test("parses a fully populated form", () => {
    const result = parsePartnershipOpportunityForm(
      formData({
        stage: "negotiating",
        nextStepDate: "2026-09-15",
        notes: "Follow up after their board meeting.",
      }),
    );
    expect(result).toEqual({
      data: {
        stage: "negotiating",
        next_step_date: "2026-09-15",
        notes: "Follow up after their board meeting.",
      },
    });
  });
});
