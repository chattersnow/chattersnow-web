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

  // #898/#360: the public fields. A form that never sends them -- which is
  // every caller written before this -- must produce an unpublished program.
  test("a form with no public fields is not public", () => {
    const result = parseProgramForm(formData(validFields));
    expect("data" in result && result.data).toMatchObject({
      isPublic: false,
      pillar: null,
      emoji: null,
      sortOrder: null,
    });
  });

  test("reads the public fields", () => {
    const result = parseProgramForm(
      formData({
        ...validFields,
        is_public: "true",
        pillar: "  Access  ",
        emoji: "❄️",
        sort_order: "2",
      }),
    );
    expect("data" in result && result.data).toMatchObject({
      isPublic: true,
      pillar: "Access",
      emoji: "❄️",
      sortOrder: 2,
    });
  });

  test("only the string 'true' publishes", () => {
    for (const value of ["false", "on", "1", ""]) {
      const result = parseProgramForm(
        formData({ ...validFields, is_public: value }),
      );
      expect("data" in result && result.data.isPublic, value).toBe(false);
    }
  });

  test("blank public fields are null, not empty strings or zero", () => {
    const result = parseProgramForm(
      formData({ ...validFields, pillar: "  ", emoji: "", sort_order: "  " }),
    );
    expect("data" in result && result.data).toMatchObject({
      pillar: null,
      emoji: null,
      sortOrder: null,
    });
  });

  test("keeps a zero order, which is not the same as none", () => {
    const result = parseProgramForm(
      formData({ ...validFields, sort_order: "0" }),
    );
    expect("data" in result && result.data.sortOrder).toBe(0);
  });

  test("rejects an order that is not a whole number", () => {
    for (const value of ["1.5", "first", "-"]) {
      expect(
        parseProgramForm(formData({ ...validFields, sort_order: value })),
      ).toEqual({ error: "Order must be a whole number." });
    }
  });
});
