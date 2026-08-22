import { describe, expect, test } from "bun:test";
import { parseInventoryItemForm } from "./inventory-item-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const validFields = {
  description: "Ski jacket",
  type: "jacket",
  condition: "good",
  status: "available",
};

describe("parseInventoryItemForm", () => {
  test("requires a description", () => {
    expect(parseInventoryItemForm(formData({ ...validFields, description: "" }))).toEqual({
      error: "Item description is required.",
    });
  });

  test("requires a type", () => {
    expect(parseInventoryItemForm(formData({ ...validFields, type: "" }))).toEqual({
      error: "Item type is required.",
    });
  });

  test("rejects an invalid condition", () => {
    expect(parseInventoryItemForm(formData({ ...validFields, condition: "mint" }))).toEqual({
      error: "Select a valid item condition.",
    });
  });

  test("rejects an invalid status", () => {
    expect(parseInventoryItemForm(formData({ ...validFields, status: "sold" }))).toEqual({
      error: "Select a valid item status.",
    });
  });

  test("rejects a negative face value", () => {
    expect(parseInventoryItemForm(formData({ ...validFields, faceValue: "-5" }))).toEqual({
      error: "Face value must be a positive number.",
    });
  });

  test("allows an omitted face value", () => {
    const result = parseInventoryItemForm(formData(validFields));
    expect("data" in result && result.data.face_value).toBeNull();
  });

  test("parses valid input", () => {
    const result = parseInventoryItemForm(
      formData({ ...validFields, size: "M", gender: "unisex", faceValue: "80", photoUrl: "https://x/y.jpg", notes: "Warm" })
    );
    expect(result).toEqual({
      data: {
        description: "Ski jacket",
        type: "jacket",
        size: "M",
        gender: "unisex",
        condition: "good",
        face_value: 80,
        status: "available",
        photo_url: "https://x/y.jpg",
        notes: "Warm",
      },
    });
  });
});
