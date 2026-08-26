import { describe, expect, test } from "bun:test";
import { parseRoleTypeForm } from "./role-type-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseRoleTypeForm", () => {
  test("parses valid input", () => {
    const result = parseRoleTypeForm(
      formData({
        name: "Ride Buddy",
        description: "Skis alongside a participant.",
      }),
    );
    expect("data" in result && result.data.name).toBe("Ride Buddy");
    expect("data" in result && result.data.description).toBe(
      "Skis alongside a participant.",
    );
  });

  test("trims the name and treats blank description as null", () => {
    const result = parseRoleTypeForm(
      formData({ name: "  Event Setup  ", description: "  " }),
    );
    expect("data" in result && result.data.name).toBe("Event Setup");
    expect("data" in result && result.data.description).toBeNull();
  });

  test("requires a name", () => {
    expect(parseRoleTypeForm(formData({ name: "", description: "" }))).toEqual({
      error: "Role name is required.",
    });
  });

  test("parses isPublic when on", () => {
    const result = parseRoleTypeForm(
      formData({ name: "Ride Buddy", isPublic: "on" }),
    );
    expect("data" in result && result.data.is_public).toBe(true);
  });

  test("defaults is_public to false when absent", () => {
    const result = parseRoleTypeForm(formData({ name: "Ride Buddy" }));
    expect("data" in result && result.data.is_public).toBe(false);
  });
});
