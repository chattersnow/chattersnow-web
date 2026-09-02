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
  chatterConnection: "Ties into our winter gear access program.",
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

  test("requires a Chatter connection once work begins", () => {
    const { chatterConnection, ...rest } = validFields;
    void chatterConnection;
    const result = parseContentOpportunityForm(formData(rest));
    expect(result).toEqual({
      error:
        "A stated Chatter connection is required once work begins on this content.",
    });
  });

  test("does not require a Chatter connection for not_planned, idea, or skipped", () => {
    const { chatterConnection, ...rest } = validFields;
    void chatterConnection;
    for (const contentStatus of ["not_planned", "idea"]) {
      const result = parseContentOpportunityForm(
        formData({ ...rest, contentStatus }),
      );
      expect("data" in result).toBe(true);
    }
    const skippedResult = parseContentOpportunityForm(
      formData({
        ...rest,
        contentStatus: "skipped",
        skipReason: "No capacity this year.",
      }),
    );
    expect("data" in skippedResult).toBe(true);
  });

  test("round-trips internal notes", () => {
    const result = parseContentOpportunityForm(
      formData({
        ...validFields,
        internalNotes: "  Waiting on final photo.  ",
      }),
    );
    expect("data" in result && result.data.internalNotes).toBe(
      "Waiting on final photo.",
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

  test("allows no template selected", () => {
    const result = parseContentOpportunityForm(formData(validFields));
    expect("data" in result && result.data.templateId).toBeNull();
    expect("data" in result && result.data.templateVersionId).toBeNull();
  });

  test("requires template id and version id together", () => {
    expect(
      parseContentOpportunityForm(
        formData({ ...validFields, templateId: "template-1" }),
      ),
    ).toEqual({
      error: "Select a content brief template before saving field values.",
    });
    expect(
      parseContentOpportunityForm(
        formData({ ...validFields, templateVersionId: "version-1" }),
      ),
    ).toEqual({
      error: "Select a content brief template before saving field values.",
    });
  });

  test("round-trips template field values", () => {
    const fd = formData({
      ...validFields,
      templateId: "template-1",
      templateVersionId: "version-1",
    });
    fd.set(
      "templateFieldValues",
      JSON.stringify({ quote: "  Great community!  " }),
    );
    const result = parseContentOpportunityForm(fd);
    expect("data" in result && result.data.templateId).toBe("template-1");
    expect("data" in result && result.data.templateVersionId).toBe("version-1");
    expect("data" in result && result.data.templateFieldValues).toEqual({
      quote: "Great community!",
    });
  });

  test("tolerates malformed template field values as an empty object", () => {
    const fd = formData({
      ...validFields,
      templateId: "template-1",
      templateVersionId: "version-1",
    });
    fd.set("templateFieldValues", "not json");
    const result = parseContentOpportunityForm(fd);
    expect("data" in result && result.data.templateFieldValues).toEqual({});
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
