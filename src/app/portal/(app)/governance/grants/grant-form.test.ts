import { describe, expect, test } from "bun:test";
import { parseGrantForm } from "./grant-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseGrantForm", () => {
  test("requires a funder name", () => {
    const result = parseGrantForm(
      formData({ funderName: "  ", applicationDeadline: "2026-09-01" }),
    );
    expect(result).toEqual({ error: "Funder name is required." });
  });

  test("requires an application deadline", () => {
    const result = parseGrantForm(formData({ funderName: "Acme Foundation" }));
    expect(result).toEqual({ error: "Application deadline is required." });
  });

  test("rejects an invalid status", () => {
    const result = parseGrantForm(
      formData({
        funderName: "Acme Foundation",
        applicationDeadline: "2026-09-01",
        status: "bogus",
      }),
    );
    expect(result).toEqual({ error: "Invalid status." });
  });

  test("rejects a negative or non-numeric amount", () => {
    const negative = parseGrantForm(
      formData({
        funderName: "Acme Foundation",
        applicationDeadline: "2026-09-01",
        amount: "-5",
      }),
    );
    expect(negative).toEqual({ error: "Amount must be a positive number." });

    const nonNumeric = parseGrantForm(
      formData({
        funderName: "Acme Foundation",
        applicationDeadline: "2026-09-01",
        amount: "not-a-number",
      }),
    );
    expect(nonNumeric).toEqual({ error: "Amount must be a positive number." });
  });

  test("defaults status to planned and leaves amount/notes null when blank", () => {
    const result = parseGrantForm(
      formData({
        funderName: "Acme Foundation",
        applicationDeadline: "2026-09-01",
      }),
    );
    expect(result).toEqual({
      data: {
        funder_name: "Acme Foundation",
        amount: null,
        application_deadline: "2026-09-01",
        status: "planned",
        notes: null,
      },
    });
  });

  test("parses a fully populated form", () => {
    const result = parseGrantForm(
      formData({
        funderName: "Acme Foundation",
        amount: "5000",
        applicationDeadline: "2026-09-01",
        status: "submitted",
        notes: "Waiting on board sign-off letter.",
      }),
    );
    expect(result).toEqual({
      data: {
        funder_name: "Acme Foundation",
        amount: 5000,
        application_deadline: "2026-09-01",
        status: "submitted",
        notes: "Waiting on board sign-off letter.",
      },
    });
  });
});
