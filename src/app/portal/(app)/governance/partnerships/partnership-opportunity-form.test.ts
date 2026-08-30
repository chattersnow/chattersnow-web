import { describe, expect, test } from "bun:test";
import { parsePartnershipOpportunityForm } from "./partnership-opportunity-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parsePartnershipOpportunityForm", () => {
  test("requires an organization name", () => {
    const result = parsePartnershipOpportunityForm(
      formData({ organizationName: "  " }),
    );
    expect(result).toEqual({ error: "Organization name is required." });
  });

  test("rejects an invalid stage", () => {
    const result = parsePartnershipOpportunityForm(
      formData({ organizationName: "Acme Co", stage: "bogus" }),
    );
    expect(result).toEqual({ error: "Invalid stage." });
  });

  test("defaults stage to prospecting and blanks optional fields to null", () => {
    const result = parsePartnershipOpportunityForm(
      formData({ organizationName: "Acme Co" }),
    );
    expect(result).toEqual({
      data: {
        organization_name: "Acme Co",
        contact_name: null,
        contact_email: null,
        stage: "prospecting",
        next_step_date: null,
        notes: null,
      },
    });
  });

  test("parses a fully populated form", () => {
    const result = parsePartnershipOpportunityForm(
      formData({
        organizationName: "Acme Co",
        contactName: "Jamie Rivera",
        contactEmail: "jamie@acme.example",
        stage: "negotiating",
        nextStepDate: "2026-09-15",
        notes: "Follow up after their board meeting.",
      }),
    );
    expect(result).toEqual({
      data: {
        organization_name: "Acme Co",
        contact_name: "Jamie Rivera",
        contact_email: "jamie@acme.example",
        stage: "negotiating",
        next_step_date: "2026-09-15",
        notes: "Follow up after their board meeting.",
      },
    });
  });
});
