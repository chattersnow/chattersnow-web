import { describe, expect, test } from "bun:test";
import { parseAnnualRequirementForm } from "./annual-requirement-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseAnnualRequirementForm", () => {
  test("requires a name", () => {
    expect(
      parseAnnualRequirementForm(formData({ dueDate: "2026-05-15" })),
    ).toEqual({
      error: "Name is required.",
    });
  });

  test("requires a due date", () => {
    expect(
      parseAnnualRequirementForm(formData({ name: "IRS Form 990" })),
    ).toEqual({
      error: "Due date is required.",
    });
  });

  test("rejects an invalid status", () => {
    expect(
      parseAnnualRequirementForm(
        formData({
          name: "IRS Form 990",
          dueDate: "2026-05-15",
          status: "almost_done",
        }),
      ),
    ).toEqual({
      error: "Invalid status.",
    });
  });

  test("defaults status to not_started", () => {
    expect(
      parseAnnualRequirementForm(
        formData({ name: "IRS Form 990", dueDate: "2026-05-15" }),
      ),
    ).toEqual({
      data: {
        name: "IRS Form 990",
        due_date: "2026-05-15",
        status: "not_started",
      },
    });
  });

  test("parses a requirement with an explicit status", () => {
    expect(
      parseAnnualRequirementForm(
        formData({
          name: "State charitable registration renewal",
          dueDate: "2026-06-30",
          status: "in_progress",
        }),
      ),
    ).toEqual({
      data: {
        name: "State charitable registration renewal",
        due_date: "2026-06-30",
        status: "in_progress",
      },
    });
  });
});
