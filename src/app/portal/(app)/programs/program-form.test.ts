import { describe, expect, test } from "bun:test";
import { parseProgramForm } from "./program-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const validFields = {
  name: "Chatter Snow Access Days",
  description: "Affordable opportunities to get on snow.",
  status: "active",
};

describe("parseProgramForm", () => {
  test("parses valid input", () => {
    const result = parseProgramForm(formData(validFields));
    expect("data" in result && result.data.name).toBe(
      "Chatter Snow Access Days",
    );
    expect("data" in result && result.data.status).toBe("active");
  });

  test("trims the name and treats blank description as null", () => {
    const result = parseProgramForm(
      formData({
        ...validFields,
        name: "  Gear Exchange  ",
        description: "  ",
      }),
    );
    expect("data" in result && result.data.name).toBe("Gear Exchange");
    expect("data" in result && result.data.description).toBeNull();
  });

  test("requires a name", () => {
    expect(parseProgramForm(formData({ ...validFields, name: "" }))).toEqual({
      error: "Program name is required.",
    });
  });

  test("requires a valid status", () => {
    expect(
      parseProgramForm(formData({ ...validFields, status: "archived" })),
    ).toEqual({
      error: "Select a valid status.",
    });
  });

  test("accepts each valid status", () => {
    for (const status of ["active", "pilot", "retired"] as const) {
      const result = parseProgramForm(formData({ ...validFields, status }));
      expect("data" in result && result.data.status).toBe(status);
    }
  });
});
