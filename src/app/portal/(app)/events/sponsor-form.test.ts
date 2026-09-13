import { describe, expect, test } from "bun:test";
import { parseSponsorForm } from "./sponsor-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseSponsorForm", () => {
  test("defaults support type to in_kind", () => {
    const result = parseSponsorForm(formData({}));
    expect("data" in result && result.data.support_type).toBe("in_kind");
  });

  test("rejects an invalid support type", () => {
    expect(parseSponsorForm(formData({ supportType: "crypto" }))).toEqual({
      error: "Select a valid support type.",
    });
  });

  test("rejects a negative contribution value", () => {
    expect(
      parseSponsorForm(
        formData({ supportType: "cash", contributionValue: "-1" }),
      ),
    ).toEqual({ error: "Contribution value must be a positive number." });
  });

  test("treats isPublic=on as public", () => {
    const result = parseSponsorForm(
      formData({ supportType: "cash", isPublic: "on" }),
    );
    expect("data" in result && result.data.is_public).toBe(true);
  });

  test("defaults isPublic to false when absent", () => {
    const result = parseSponsorForm(formData({ supportType: "cash" }));
    expect("data" in result && result.data.is_public).toBe(false);
  });

  test("parses valid input", () => {
    const result = parseSponsorForm(
      formData({
        supportType: "both",
        items: JSON.stringify([
          { description: "Tents", faceValue: "500", intendedUse: "giveaway" },
        ]),
        contributionValue: "500",
        isPublic: "true",
        notes: "Annual sponsor",
      }),
    );
    expect(result).toEqual({
      data: {
        support_type: "both",
        contribution_value: 500,
        is_public: true,
        notes: "Annual sponsor",
        follow_up_status: "not_started",
        follow_up_notes: null,
        items: [
          {
            id: null,
            description: "Tents",
            face_value: 500,
            intended_use: "giveaway",
          },
        ],
      },
    });
  });

  test("rejects an invalid follow-up status", () => {
    expect(
      parseSponsorForm(
        formData({ supportType: "cash", followUpStatus: "later" }),
      ),
    ).toEqual({ error: "Select a valid follow-up status." });
  });

  test("parses follow-up fields", () => {
    const result = parseSponsorForm(
      formData({
        supportType: "cash",
        followUpStatus: "done",
        followUpNotes: "Sent thank-you",
      }),
    );
    expect("data" in result && result.data.follow_up_status).toBe("done");
    expect("data" in result && result.data.follow_up_notes).toBe(
      "Sent thank-you",
    );
  });
});

describe("parseSponsorForm items", () => {
  function withItems(items: unknown[], fields: Record<string, string> = {}) {
    return parseSponsorForm(
      formData({
        supportType: "in_kind",
        items: JSON.stringify(items),
        ...fields,
      }),
    );
  }

  test("keeps several items, each with its own value and destination", () => {
    const result = withItems([
      { description: "Board", faceValue: "450", intendedUse: "giveaway" },
      { description: "Tees", faceValue: "25", intendedUse: "gear_library" },
    ]);
    expect("data" in result && result.data.items).toEqual([
      {
        id: null,
        description: "Board",
        face_value: 450,
        intended_use: "giveaway",
      },
      {
        id: null,
        description: "Tees",
        face_value: 25,
        intended_use: "gear_library",
      },
    ]);
  });

  test("carries an existing item's id through, so it is updated not replaced", () => {
    const result = withItems([
      {
        id: "abc",
        description: "Board",
        faceValue: "",
        intendedUse: "internal",
      },
    ]);
    expect("data" in result && result.data.items[0]).toEqual({
      id: "abc",
      description: "Board",
      face_value: null,
      intended_use: "internal",
    });
  });

  test("defaults an item with no destination to the giveaway", () => {
    const result = withItems([{ description: "Lift tickets" }]);
    expect("data" in result && result.data.items[0]?.intended_use).toBe(
      "giveaway",
    );
  });

  // The list always renders one row, so a cash-only sponsorship would be
  // unsavable if an untouched row counted as an error.
  test("drops a row left entirely blank", () => {
    const result = withItems([
      { description: "", faceValue: "" },
      { description: "Goggles", faceValue: "90" },
    ]);
    expect("data" in result && result.data.items).toHaveLength(1);
  });

  test("rejects a row with a value but no description", () => {
    expect(withItems([{ description: "  ", faceValue: "90" }])).toEqual({
      error: "Item 1: description is required.",
    });
  });

  test("names the row in a bad value's message", () => {
    expect(
      withItems([
        { description: "Board" },
        { description: "Tees", faceValue: "-5" },
      ]),
    ).toEqual({ error: "Item 2: value must be a positive number." });
  });

  test("rejects an unknown destination", () => {
    expect(
      withItems([{ description: "Board", intendedUse: "auction" }]),
    ).toEqual({ error: "Item 1: select where the item is headed." });
  });

  test("rejects an item list that is not readable JSON", () => {
    expect(
      parseSponsorForm(formData({ supportType: "in_kind", items: "{oops" })),
    ).toEqual({ error: "Could not read the item list. Please try again." });
  });

  // Switching to cash is how a sponsorship's goods are meant to go away, and
  // the hidden editor still holds the rows it had.
  test("drops items when the support type carries none", () => {
    const result = withItems([{ description: "Board", faceValue: "450" }], {
      supportType: "cash",
    });
    expect("data" in result && result.data.items).toEqual([]);
  });

  test("treats an absent item list as no items", () => {
    const result = parseSponsorForm(formData({ supportType: "in_kind" }));
    expect("data" in result && result.data.items).toEqual([]);
  });
});
