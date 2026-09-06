import { describe, expect, test } from "bun:test";
import { parseActionItemForm } from "./action-item-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validFields = {
  description: "  Renew the trailer registration.  ",
  dueDate: "2026-04-01",
  status: "done",
};

describe("parseActionItemForm", () => {
  test("parses a fully filled form", () => {
    expect(parseActionItemForm(formData(validFields))).toEqual({
      data: {
        description: "Renew the trailer registration.",
        due_date: "2026-04-01",
        status: "done",
      },
    });
  });

  test("turns a blank due date into null", () => {
    const result = parseActionItemForm(
      formData({ ...validFields, dueDate: "   " }),
    );
    expect("data" in result && result.data.due_date).toBeNull();
  });

  test("defaults an absent status to open", () => {
    const data = formData(validFields);
    data.delete("status");
    const result = parseActionItemForm(data);
    expect("data" in result && result.data.status).toBe("open");
  });

  test("requires a description", () => {
    expect(
      parseActionItemForm(formData({ ...validFields, description: "  " })),
    ).toEqual({ error: "Description is required." });
  });

  test("rejects a status outside open and done", () => {
    expect(
      parseActionItemForm(formData({ ...validFields, status: "in_progress" })),
    ).toEqual({ error: "Invalid status." });
    expect(
      parseActionItemForm(formData({ ...validFields, status: "DONE" })),
    ).toEqual({ error: "Invalid status." });
  });

  test("rejects a blank status, which no longer means open", () => {
    expect(
      parseActionItemForm(formData({ ...validFields, status: "   " })),
    ).toEqual({ error: "Invalid status." });
  });
});
