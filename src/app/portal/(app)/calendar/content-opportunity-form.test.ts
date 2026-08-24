import { describe, expect, test } from "bun:test";
import { parseContentOpportunityForm } from "./content-opportunity-form";
import { leadTimeSchedule } from "./content-opportunity-shared";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const validFields = {
  contentStatus: "draft",
  leadTimeDays: "21",
  publishDueAt: "2027-03-31T09:00",
  reviewDueAt: "2027-03-24T09:00",
  draftDueAt: "2027-03-17T09:00",
};

describe("parseContentOpportunityForm", () => {
  test("parses valid input", () => {
    const result = parseContentOpportunityForm(formData(validFields));
    expect("data" in result && result.data.contentStatus).toBe("draft");
    expect("data" in result && result.data.leadTimeDays).toBe(21);
    expect("data" in result && result.data.skipReason).toBeNull();
  });

  test("requires a valid content status", () => {
    expect(
      parseContentOpportunityForm(
        formData({ ...validFields, contentStatus: "made_up" }),
      ),
    ).toEqual({
      error: "Select a valid content status.",
    });
  });

  test("requires a reason when content is skipped", () => {
    const result = parseContentOpportunityForm(
      formData({ ...validFields, contentStatus: "skipped" }),
    );
    expect(result).toEqual({
      error: "A reason is required when content is skipped.",
    });
  });

  test("accepts a skip status with a reason", () => {
    const result = parseContentOpportunityForm(
      formData({
        ...validFields,
        contentStatus: "skipped",
        skipReason: "No capacity this year.",
      }),
    );
    expect("data" in result && result.data.skipReason).toBe(
      "No capacity this year.",
    );
  });

  test("requires a positive whole-number lead time", () => {
    expect(
      parseContentOpportunityForm(
        formData({ ...validFields, leadTimeDays: "0" }),
      ),
    ).toEqual({
      error: "Lead time must be a whole number of days greater than zero.",
    });
    expect(
      parseContentOpportunityForm(
        formData({ ...validFields, leadTimeDays: "7.5" }),
      ),
    ).toEqual({
      error: "Lead time must be a whole number of days greater than zero.",
    });
  });

  test("requires draft due on or before review due", () => {
    const result = parseContentOpportunityForm(
      formData({ ...validFields, draftDueAt: "2027-03-25T09:00" }),
    );
    expect(result).toEqual({
      error: "Draft due date must be on or before the review due date.",
    });
  });

  test("requires review due on or before publish due", () => {
    const result = parseContentOpportunityForm(
      formData({ ...validFields, reviewDueAt: "2027-04-01T09:00" }),
    );
    expect(result).toEqual({
      error: "Review due date must be on or before the publish due date.",
    });
  });

  test("allows empty due dates", () => {
    const result = parseContentOpportunityForm(
      formData({ contentStatus: "not_planned", leadTimeDays: "21" }),
    );
    expect("data" in result && result.data.publishDueAt).toBeNull();
  });
});

describe("leadTimeSchedule", () => {
  test("matches the issue's worked example: 21-day lead time -> draft T-14, review T-7", () => {
    const publishDueAt = new Date("2027-03-31T00:00:00.000Z");
    const { draftDueAt, reviewDueAt } = leadTimeSchedule(publishDueAt, 21);
    expect(draftDueAt.toISOString()).toBe("2027-03-17T00:00:00.000Z");
    expect(reviewDueAt.toISOString()).toBe("2027-03-24T00:00:00.000Z");
  });
});
