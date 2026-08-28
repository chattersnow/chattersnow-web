import { describe, expect, test } from "bun:test";
import { parseMilestoneForm } from "./nonprofit-status-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseMilestoneForm", () => {
  test("requires a description", () => {
    expect(parseMilestoneForm(formData({ phase: "Phase 1" }))).toEqual({
      error: "Description is required.",
    });
  });

  test("requires a phase", () => {
    expect(
      parseMilestoneForm(formData({ description: "File the EIN application" })),
    ).toEqual({
      error: "Phase is required.",
    });
  });

  test("rejects an invalid status", () => {
    expect(
      parseMilestoneForm(
        formData({
          description: "File the EIN application",
          phase: "Phase 2",
          status: "almost_done",
        }),
      ),
    ).toEqual({
      error: "Invalid status.",
    });
  });

  test("defaults status to not_started and due date to null", () => {
    expect(
      parseMilestoneForm(
        formData({
          description: "File the EIN application",
          phase: "Phase 2",
        }),
      ),
    ).toEqual({
      data: {
        description: "File the EIN application",
        phase: "Phase 2",
        status: "not_started",
        due_date: null,
      },
    });
  });

  test("parses a milestone with status and due date", () => {
    expect(
      parseMilestoneForm(
        formData({
          description: "File the EIN application",
          phase: "Phase 2",
          status: "in_progress",
          dueDate: "2026-09-01",
        }),
      ),
    ).toEqual({
      data: {
        description: "File the EIN application",
        phase: "Phase 2",
        status: "in_progress",
        due_date: "2026-09-01",
      },
    });
  });

  test("accepts the cancelled status", () => {
    expect(
      parseMilestoneForm(
        formData({
          description: "File the EIN application",
          phase: "Phase 2",
          status: "cancelled",
        }),
      ),
    ).toEqual({
      data: {
        description: "File the EIN application",
        phase: "Phase 2",
        status: "cancelled",
        due_date: null,
      },
    });
  });
});
