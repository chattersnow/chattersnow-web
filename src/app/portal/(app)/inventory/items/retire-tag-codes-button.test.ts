import { describe, expect, test } from "bun:test";
import { itemsWithBothCodes } from "./retire-tag-codes-button";
import { assignedMessage } from "./[itemId]/numbered-code-buttons";

describe("retiring tag codes (#1544)", () => {
  test("counts only items with both a tag code and a numbered code", () => {
    expect(
      itemsWithBothCodes([
        { assetTag: "AB12CD", numberedCode: "CSN-007" },
        { assetTag: "EF34GH", numberedCode: null },
        { assetTag: null, numberedCode: "CSN-008" },
        {},
      ]),
    ).toBe(1);
  });

  test("assigning says which tag code was retired with it", () => {
    expect(
      assignedMessage({
        outcome: "assigned",
        code: "CSN-007",
        retiredTagCodes: ["AB12CD"],
      }),
    ).toBe(
      "CSN-007 is on this item now. AB12CD is retired: take the old label off.",
    );
    expect(
      assignedMessage({
        outcome: "already",
        code: "CSN-007",
        retiredTagCodes: [],
      }),
    ).toBe("CSN-007 is already on this item.");
  });
});
