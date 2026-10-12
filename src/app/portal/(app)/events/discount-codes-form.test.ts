import { describe, expect, test } from "bun:test";
import {
  parseDiscountCodeDetails,
  parseDiscountCodePin,
  parseDiscountCodesForm,
  parseSharedDiscountCodeForm,
} from "./discount-codes-form";

const codes = (...values: string[]) =>
  values.map((code) => ({ code, pin: null }));

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
        codes: codes("SNOW10", "SNOW20"),
        description: "Season pass batch",
        source: "Resort partner",
        kind: null,
        value: null,
        coverage: [],
      },
    });
  });

  test("drops blank lines", () => {
    const result = parseDiscountCodesForm(
      formData({ codes: "\n\nSNOW10\n   \n\nSNOW20\n\n" }),
    );
    expect("data" in result && result.data.codes).toEqual(
      codes("SNOW10", "SNOW20"),
    );
  });

  test("keeps the first spelling of a code repeated in a different case", () => {
    const result = parseDiscountCodesForm(
      formData({ codes: "Snow10\nSNOW10\nsnow10\nSNOW20" }),
    );
    expect("data" in result && result.data.codes).toEqual(
      codes("Snow10", "SNOW20"),
    );
  });

  test("survives Windows line endings", () => {
    const result = parseDiscountCodesForm(
      formData({ codes: "SNOW10\r\nSNOW20\r\n" }),
    );
    expect("data" in result && result.data.codes).toEqual(
      codes("SNOW10", "SNOW20"),
    );
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

// #1588: what a code pays for and is worth feed the Results card.
describe("parseDiscountCodeDetails", () => {
  test("reads a kind and a value, rounded to cents", () => {
    expect(
      parseDiscountCodeDetails(formData({ kind: "rental", value: "45.555" })),
    ).toEqual({
      data: {
        description: null,
        source: null,
        kind: "rental",
        value: 45.56,
        coverage: [],
      },
    });
  });

  test("leaves both optional", () => {
    expect(parseDiscountCodeDetails(formData({}))).toEqual({
      data: {
        description: null,
        source: null,
        kind: null,
        value: null,
        coverage: [],
      },
    });
  });

  test("rejects a kind outside the list", () => {
    expect(parseDiscountCodeDetails(formData({ kind: "parking" }))).toEqual({
      error: "Choose what the code is for from the list.",
    });
  });

  test("rejects a negative or non-numeric value", () => {
    for (const value of ["-1", "abc", "Infinity"]) {
      expect(parseDiscountCodeDetails(formData({ value }))).toEqual({
        error: "Value must be a positive amount.",
      });
    }
  });

  test("a batch carries the details to every code", () => {
    const result = parseDiscountCodesForm(
      formData({ codes: "A\nB", kind: "lift", value: "60" }),
    );
    expect("data" in result && result.data).toMatchObject({
      codes: codes("A", "B"),
      kind: "lift",
      value: 60,
    });
  });
});

// #1589: a partner's CSV of codes and PINs pastes straight in.
describe("parseDiscountCodesForm with PINs", () => {
  test("reads CODE, PIN and CODE<tab>PIN lines beside bare codes", () => {
    const result = parseDiscountCodesForm(
      formData({ codes: "SNOW10, 4821\nSNOW11\t9930\r\nSNOW12\nSNOW13," }),
    );
    expect("data" in result && result.data.codes).toEqual([
      { code: "SNOW10", pin: "4821" },
      { code: "SNOW11", pin: "9930" },
      { code: "SNOW12", pin: null },
      { code: "SNOW13", pin: null },
    ]);
  });

  test("rejects a line with more than a code and a PIN, naming it", () => {
    expect(
      parseDiscountCodesForm(formData({ codes: "A, 1\nB, 2, extra" })),
    ).toEqual({
      error:
        "Line 2 has more than a code and a PIN. Put one code per line, optionally followed by a comma and its PIN.",
    });
  });

  test("rejects a PIN with no code", () => {
    expect(parseDiscountCodesForm(formData({ codes: ", 1234" }))).toEqual({
      error: "Line 1 has a PIN but no code.",
    });
  });

  test("rejects an overlong PIN", () => {
    expect(
      parseDiscountCodesForm(formData({ codes: `A, ${"9".repeat(65)}` })),
    ).toEqual({ error: "Line 1: A PIN can be at most 64 characters." });
  });
});

describe("parseDiscountCodePin", () => {
  test("trims, and reads blank as no PIN", () => {
    expect(parseDiscountCodePin(formData({ pin: " 4821 " }))).toEqual({
      data: "4821",
    });
    expect(parseDiscountCodePin(formData({ pin: "  " }))).toEqual({
      data: null,
    });
  });
});

describe("coverage", () => {
  test("reads a percentage per option and skips blanks", () => {
    const result = parseDiscountCodeDetails(
      formData({
        "percentOff.ticket": "50",
        "percentOff.bundle": "33.333",
        "percentOff.own": "",
      }),
    );
    expect("data" in result && result.data.coverage).toEqual([
      { optionId: "ticket", percentOff: 50 },
      { optionId: "bundle", percentOff: 33.33 },
    ]);
  });

  test("rejects 0, more than 100, or not a number", () => {
    for (const value of ["0", "101", "half"]) {
      expect(
        parseDiscountCodeDetails(formData({ "percentOff.ticket": value })),
      ).toEqual({
        error: "A percentage off must be more than 0 and at most 100.",
      });
    }
  });
});

describe("parseSharedDiscountCodeForm", () => {
  test("reads the code, its PIN and details", () => {
    expect(
      parseSharedDiscountCodeForm(
        formData({
          code: " GROUP50 ",
          pin: "7731",
          source: "Mountain partner",
          "percentOff.ticket": "50",
        }),
      ),
    ).toEqual({
      data: {
        code: "GROUP50",
        pin: "7731",
        description: null,
        source: "Mountain partner",
        kind: null,
        value: null,
        coverage: [{ optionId: "ticket", percentOff: 50 }],
      },
    });
  });

  test("requires a code", () => {
    expect(parseSharedDiscountCodeForm(formData({ pin: "1" }))).toEqual({
      error: "Enter the shared code.",
    });
  });
});
