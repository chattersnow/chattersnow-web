import { describe, expect, test } from "bun:test";
import {
  EMPTY_CODE_FILTERS,
  codeFilterParams,
  codeQueryArgs,
  codesHref,
  codesPrintHref,
  hasCodeFilters,
  parseCodeFilters,
  parseCodeSearch,
  parseTagIds,
} from "./inventory-codes";
import { parseNumberedTag } from "./inventory-tags";

const ID_A = "0f1e2d3c-4b5a-4968-8776-655443322110";
const ID_B = "11111111-2222-4333-8444-555555555555";

describe("parseCodeFilters", () => {
  test("reads every filter from the URL", () => {
    expect(
      parseCodeFilters({
        kind: "numbered",
        state: "free",
        unprinted: "1",
        unwritten: "1",
        from: "10",
        to: "20",
        search: "  csn7  ",
      }),
    ).toEqual({
      kind: "numbered",
      state: "free",
      neverPrinted: true,
      notWritten: true,
      from: 10,
      to: 20,
      search: "csn7",
    });
  });

  test("drops what it does not recognize", () => {
    expect(
      parseCodeFilters({
        kind: "barcode",
        state: "lost",
        unprinted: "yes",
        from: "0",
        to: "-3",
      }),
    ).toEqual(EMPTY_CODE_FILTERS);
  });

  test("puts a reversed range low to high", () => {
    const filters = parseCodeFilters({ from: "50", to: "5" });
    expect([filters.from, filters.to]).toEqual([5, 50]);
  });

  test("round-trips through the query string", () => {
    const filters = parseCodeFilters({
      kind: "blank",
      unwritten: "1",
      search: "helmet",
    });
    expect(
      parseCodeFilters(Object.fromEntries(codeFilterParams(filters))),
    ).toEqual(filters);
    expect(hasCodeFilters(filters)).toBe(true);
    expect(hasCodeFilters(EMPTY_CODE_FILTERS)).toBe(false);
  });
});

describe("parseCodeSearch", () => {
  test("is as forgiving as assigning a code (#1444)", () => {
    for (const typed of ["7", "007", "csn7", "CSN-7", "csn-007", "CSN-007"]) {
      expect(parseCodeSearch(typed, "CSN")).toBe(7);
      // The same parser the assign input uses, so the two can't drift.
      expect(parseNumberedTag(typed)?.number).toBe(7);
    }
  });

  test("another organization's prefix names no number", () => {
    expect(parseCodeSearch("ABC-007", "CSN")).toBeNull();
  });

  test("text that can't be a numbered code is left to the text search", () => {
    expect(parseCodeSearch("helmet", "CSN")).toBeNull();
    expect(parseCodeSearch("4F7K2Q", "CSN")).toBeNull();
  });
});

describe("codeQueryArgs", () => {
  test("leaves unset filters out", () => {
    expect(codeQueryArgs(EMPTY_CODE_FILTERS, "CSN")).toEqual({
      p_kinds: undefined,
      p_states: undefined,
      p_never_printed: false,
      p_not_written: false,
      p_number_from: undefined,
      p_number_to: undefined,
      p_search: undefined,
      p_search_number: undefined,
    });
  });

  test("a number range narrows to numbered codes", () => {
    const args = codeQueryArgs({ ...EMPTY_CODE_FILTERS, from: 1 }, "CSN");
    expect(args.p_kinds).toEqual(["numbered"]);
    expect(args.p_number_from).toBe(1);
  });

  test("a search carries its number when it has one", () => {
    const args = codeQueryArgs(
      { ...EMPTY_CODE_FILTERS, search: "csn7" },
      "CSN",
    );
    expect(args.p_search).toBe("csn7");
    expect(args.p_search_number).toBe(7);
  });
});

describe("parseTagIds", () => {
  test("keeps uuids once, in order", () => {
    expect(parseTagIds(`${ID_B},junk,${ID_A.toUpperCase()},${ID_B}`)).toEqual([
      ID_B,
      ID_A,
    ]);
    expect(parseTagIds([ID_A, "nope"])).toEqual([ID_A]);
    expect(parseTagIds(undefined)).toEqual([]);
  });
});

describe("hrefs", () => {
  test("the list keeps its filters", () => {
    expect(codesHref()).toBe("/portal/inventory/items/codes");
    expect(
      codesHref({ ...EMPTY_CODE_FILTERS, state: "free", neverPrinted: true }),
    ).toBe("/portal/inventory/items/codes?state=free&unprinted=1");
  });

  test("the print view takes ids or the filters", () => {
    expect(codesPrintHref({ ids: [ID_A, ID_B] })).toBe(
      `/portal/inventory/items/codes?print=${ID_A},${ID_B}`,
    );
    expect(
      codesPrintHref({
        filters: { ...EMPTY_CODE_FILTERS, kind: "numbered", state: "free" },
      }),
    ).toBe(
      "/portal/inventory/items/codes?kind=numbered&state=free&print=filter",
    );
  });
});
