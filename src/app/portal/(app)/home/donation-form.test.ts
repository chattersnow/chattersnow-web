import { describe, expect, test } from "bun:test";
import { parseDonationInput, type CreateDonationInput } from "./donation-form";

const validItem = {
  description: "Jacket",
  categoryKey: "jacket",
  condition: "good",
};

const validInput: CreateDonationInput = {
  isAnonymous: false,
  donorName: "Jane Donor",
  sourceType: "individual",
  items: [validItem],
};

describe("parseDonationInput", () => {
  test("requires a donor name unless anonymous", () => {
    expect(parseDonationInput({ ...validInput, donorName: "" })).toEqual({
      error: "Donor name is required unless the donation is anonymous.",
    });
  });

  test("allows an empty donor name when anonymous", () => {
    const result = parseDonationInput({
      ...validInput,
      isAnonymous: true,
      donorName: "",
    });
    expect("data" in result && result.data.p_donor_name).toBeNull();
  });

  test("rejects an invalid source type", () => {
    expect(parseDonationInput({ ...validInput, sourceType: "crypto" })).toEqual(
      {
        error: "Select a valid donor source.",
      },
    );
  });

  test("requires at least one item", () => {
    expect(parseDonationInput({ ...validInput, items: [] })).toEqual({
      error: "Add at least one item to the donation.",
    });
  });

  test("requires each item's description", () => {
    expect(
      parseDonationInput({
        ...validInput,
        items: [{ ...validItem, description: "" }],
      }),
    ).toEqual({ error: "Item 1: description is required." });
  });

  test("requires each item's category", () => {
    expect(
      parseDonationInput({
        ...validInput,
        items: [{ ...validItem, categoryKey: "" }],
      }),
    ).toEqual({ error: "Item 1: category is required." });
  });

  test("requires the free-text detail when an item's category is Other", () => {
    expect(
      parseDonationInput({
        ...validInput,
        items: [{ ...validItem, categoryKey: "other" }],
      }),
    ).toEqual({
      error: "Item 1: describe the item when the category is Other.",
    });
  });

  test("accepts an Other item that carries a detail", () => {
    const result = parseDonationInput({
      ...validInput,
      items: [
        { ...validItem, categoryKey: "other", categoryDetail: "Ski poles" },
      ],
    });
    expect("data" in result && result.data.p_items[0]).toMatchObject({
      category_key: "other",
      type: "Ski poles",
    });
  });

  test("rejects an invalid item condition", () => {
    expect(
      parseDonationInput({
        ...validInput,
        items: [{ ...validItem, condition: "mint" }],
      }),
    ).toEqual({ error: "Item 1: select a valid condition." });
  });

  test("rejects a negative item face value", () => {
    expect(
      parseDonationInput({
        ...validInput,
        items: [{ ...validItem, faceValue: -5 }],
      }),
    ).toEqual({ error: "Item 1: face value must be a positive number." });
  });

  test("rejects an invalid item intended use", () => {
    expect(
      parseDonationInput({
        ...validInput,
        items: [{ ...validItem, intendedUse: "sale" }],
      }),
    ).toEqual({ error: "Item 1: select a valid intended use." });
  });

  test("defaults an omitted intended use to the gear library", () => {
    const result = parseDonationInput(validInput);
    expect("data" in result && result.data.p_items[0].intended_use).toBe(
      "gear_library",
    );
  });

  test("labels the failing item by position for multi-item donations", () => {
    expect(
      parseDonationInput({
        ...validInput,
        items: [validItem, { ...validItem, description: "" }],
      }),
    ).toEqual({ error: "Item 2: description is required." });
  });

  test("maps valid input to rpc args", () => {
    const result = parseDonationInput({
      ...validInput,
      donorEmail: "jane@example.com",
      eventId: "event-1",
      items: [{ ...validItem, size: "M", faceValue: 40 }],
    });
    expect(result).toEqual({
      data: {
        p_donor_name: "Jane Donor",
        p_donor_is_anonymous: false,
        p_donor_source_type: "individual",
        p_donor_email: "jane@example.com",
        p_donor_phone: null,
        p_donor_notes: null,
        p_items: [
          {
            description: "Jacket",
            size: "M",
            category_key: "jacket",
            type: null,
            gender: null,
            condition: "good",
            face_value: 40,
            intended_use: "gear_library",
            notes: null,
            giveaway_tier: null,
            photo_url: null,
          },
        ],
        p_event_id: "event-1",
      },
    });
  });

  test("passes a photo URL through to the rpc args", () => {
    const result = parseDonationInput({
      ...validInput,
      items: [
        {
          ...validItem,
          photoUrl:
            "  https://abcdefgh.supabase.co/storage/v1/object/public/gear-photos/t/p.jpg  ",
        },
      ],
    });
    expect("data" in result && result.data.p_items[0].photo_url).toBe(
      "https://abcdefgh.supabase.co/storage/v1/object/public/gear-photos/t/p.jpg",
    );
  });

  // A legacy Google Drive share link stays valid -- pasting one is not a
  // regression now that the field also uploads.
  test("accepts an external link", () => {
    const result = parseDonationInput({
      ...validInput,
      items: [
        { ...validItem, photoUrl: "https://drive.google.com/file/d/ABC/view" },
      ],
    });
    expect("data" in result && result.data.p_items[0].photo_url).toBe(
      "https://drive.google.com/file/d/ABC/view",
    );
  });

  test("rejects a photo value that isn't an http(s) URL", () => {
    expect(
      parseDonationInput({
        ...validInput,
        items: [validItem, { ...validItem, photoUrl: "javascript:alert(1)" }],
      }),
    ).toEqual({
      error: "Item 2: the photo link must start with http:// or https://.",
    });
  });
});
