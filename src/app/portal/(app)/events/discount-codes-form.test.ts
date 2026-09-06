import { describe, expect, test } from "bun:test";
import { parseDiscountCodesForm } from "./discount-codes-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("parseDiscountCodesForm", () => {
  test("splits one code per line and trims each", () => {
    expect(
      parseDiscountCodesForm(
        formData({
          codes: "  SNOW10  \n SNOW20\n",
          description: "  Season pass batch  ",
          source: "  Resort partner  ",
        }),
      ),
    ).toEqual({
      data: {
        codes: ["SNOW10", "SNOW20"],
        description: "Season pass batch",
        source: "Resort partner",
      },
    });
  });

  test("drops blank lines", () => {
    const result = parseDiscountCodesForm(
      formData({ codes: "\n\nSNOW10\n   \n\nSNOW20\n\n" }),
    );
    expect("data" in result && result.data.codes).toEqual(["SNOW10", "SNOW20"]);
  });

  test("keeps the first spelling of a code repeated in a different case", () => {
    const result = parseDiscountCodesForm(
      formData({ codes: "Snow10\nSNOW10\nsnow10\nSNOW20" }),
    );
    expect("data" in result && result.data.codes).toEqual(["Snow10", "SNOW20"]);
  });

  test("survives Windows line endings", () => {
    const result = parseDiscountCodesForm(
      formData({ codes: "SNOW10\r\nSNOW20\r\n" }),
    );
    expect("data" in result && result.data.codes).toEqual(["SNOW10", "SNOW20"]);
  });

  test("turns a blank description and source into null", () => {
    const result = parseDiscountCodesForm(
      formData({ codes: "SNOW10", description: "  ", source: "" }),
    );
    expect("data" in result && result.data).toMatchObject({
      description: null,
      source: null,
    });
  });

  test("rejects a batch with no codes", () => {
    expect(parseDiscountCodesForm(formData({ codes: "" }))).toEqual({
      error: "Enter at least one code, one per line.",
    });
  });

  test("rejects a batch of nothing but whitespace", () => {
    expect(parseDiscountCodesForm(formData({ codes: "  \n \n\t\n" }))).toEqual({
      error: "Enter at least one code, one per line.",
    });
  });

  test("rejects an entirely empty form", () => {
    expect(parseDiscountCodesForm(new FormData())).toEqual({
      error: "Enter at least one code, one per line.",
    });
  });
});
