import { describe, expect, test } from "bun:test";
import { parseInventoryItemForm } from "./inventory-item-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const validFields = {
  description: "Ski jacket",
  categoryId: "11111111-1111-1111-1111-111111111111",
  condition: "good",
  status: "available",
  intendedUse: "gear_library",
};

describe("parseInventoryItemForm", () => {
  test("requires a description", () => {
    expect(
      parseInventoryItemForm(formData({ ...validFields, description: "" })),
    ).toEqual({
      error: "Item description is required.",
    });
  });

  test("requires a category", () => {
    expect(
      parseInventoryItemForm(formData({ ...validFields, categoryId: "" })),
    ).toEqual({
      error: "Item category is required.",
    });
  });

  test("requires the free-text detail when the category is Other", () => {
    expect(
      parseInventoryItemForm(
        formData({ ...validFields, categoryIsOther: "true" }),
      ),
    ).toEqual({
      error: "Describe the item when the category is Other.",
    });
  });

  test("accepts the free-text detail when the category is Other", () => {
    const result = parseInventoryItemForm(
      formData({
        ...validFields,
        categoryIsOther: "true",
        categoryDetail: "Vintage ski poles",
      }),
    );
    expect("data" in result && result.data.type).toBe("Vintage ski poles");
  });

  test("stores no detail for an ordinary category", () => {
    const result = parseInventoryItemForm(formData(validFields));
    expect("data" in result && result.data.type).toBeNull();
  });

  test("rejects an invalid condition", () => {
    expect(
      parseInventoryItemForm(formData({ ...validFields, condition: "mint" })),
    ).toEqual({
      error: "Select a valid item condition.",
    });
  });

  test("rejects an invalid status", () => {
    expect(
      parseInventoryItemForm(formData({ ...validFields, status: "sold" })),
    ).toEqual({
      error: "Select a valid item status.",
    });
  });

  test("rejects an invalid intended use", () => {
    expect(
      parseInventoryItemForm(formData({ ...validFields, intendedUse: "sale" })),
    ).toEqual({
      error: "Select a valid intended use.",
    });
  });

  test("rejects a negative face value", () => {
    expect(
      parseInventoryItemForm(formData({ ...validFields, faceValue: "-5" })),
    ).toEqual({
      error: "Face value must be a positive number.",
    });
  });

  test("allows an omitted face value", () => {
    const result = parseInventoryItemForm(formData(validFields));
    expect("data" in result && result.data.face_value).toBeNull();
  });

  test("parses valid input", () => {
    const result = parseInventoryItemForm(
      formData({
        ...validFields,
        size: "M",
        gender: "unisex",
        faceValue: "80",
        photoUrl: "https://x/y.jpg",
        notes: "Warm",
      }),
    );
    expect(result).toEqual({
      data: {
        description: "Ski jacket",
        category_id: "11111111-1111-1111-1111-111111111111",
        type: null,
        size: "M",
        gender: "unisex",
        condition: "good",
        face_value: 80,
        status: "available",
        intended_use: "gear_library",
        photo_url: "https://x/y.jpg",
        notes: "Warm",
      },
    });
  });
});
