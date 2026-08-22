import { describe, expect, test } from "bun:test";
import { parseDonationInput, type CreateDonationInput } from "./donation-form";

const validItem = { description: "Jacket", type: "jacket", condition: "good" };

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
    const result = parseDonationInput({ ...validInput, isAnonymous: true, donorName: "" });
    expect("data" in result && result.data.p_donor_name).toBeNull();
  });

  test("rejects an invalid source type", () => {
    expect(parseDonationInput({ ...validInput, sourceType: "crypto" })).toEqual({
      error: "Select a valid donor source.",
    });
  });

  test("requires at least one item", () => {
    expect(parseDonationInput({ ...validInput, items: [] })).toEqual({
      error: "Add at least one item to the donation.",
    });
  });

  test("requires each item's description", () => {
    expect(
      parseDonationInput({ ...validInput, items: [{ ...validItem, description: "" }] })
    ).toEqual({ error: "Item 1: description is required." });
  });

  test("requires each item's type", () => {
    expect(
      parseDonationInput({ ...validInput, items: [{ ...validItem, type: "" }] })
    ).toEqual({ error: "Item 1: type is required." });
  });

  test("rejects an invalid item condition", () => {
    expect(
      parseDonationInput({ ...validInput, items: [{ ...validItem, condition: "mint" }] })
    ).toEqual({ error: "Item 1: select a valid condition." });
  });

  test("rejects a negative item face value", () => {
    expect(
      parseDonationInput({ ...validInput, items: [{ ...validItem, faceValue: -5 }] })
    ).toEqual({ error: "Item 1: face value must be a positive number." });
  });

  test("labels the failing item by position for multi-item donations", () => {
    expect(
      parseDonationInput({
        ...validInput,
        items: [validItem, { ...validItem, description: "" }],
      })
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
            type: "jacket",
            gender: null,
            condition: "good",
            face_value: 40,
            notes: null,
          },
        ],
        p_event_id: "event-1",
      },
    });
  });
});
