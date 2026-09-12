import { describe, expect, test } from "bun:test";
import { ACCESS_LEVELS } from "@/lib/portal/access-management/types";
import { parseAccessGrantForm } from "./access-grant-form";

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const validFields = {
  person_id: "person-1",
  access_level: "admin",
  account_identifier: "  avery@example.com  ",
  purpose: "  Manages DNS records.  ",
  expires_at: "2026-12-31",
  notes: "  Review at the January meeting.  ",
};

describe("parseAccessGrantForm", () => {
  test("parses a fully filled form", () => {
    expect(parseAccessGrantForm(formData(validFields))).toEqual({
      data: {
        person_id: "person-1",
        access_level: "admin",
        account_identifier: "avery@example.com",
        purpose: "Manages DNS records.",
        expires_at: "2026-12-31",
        notes: "Review at the January meeting.",
      },
    });
  });

  test("turns blank optional fields into null", () => {
    const result = parseAccessGrantForm(
      formData({
        ...validFields,
        account_identifier: "",
        purpose: "  ",
        expires_at: "",
        notes: "   ",
      }),
    );
    expect("data" in result && result.data).toMatchObject({
      account_identifier: null,
      purpose: null,
      expires_at: null,
      notes: null,
    });
  });

  test("requires a person", () => {
    expect(
      parseAccessGrantForm(formData({ ...validFields, person_id: "  " })),
    ).toEqual({ error: "Select a person." });
  });

  test("rejects a missing access level", () => {
    const data = formData(validFields);
    data.delete("access_level");
    expect(parseAccessGrantForm(data)).toEqual({
      error: "Select a valid access level.",
    });
  });

  test("rejects an unknown access level", () => {
    expect(
      parseAccessGrantForm(
        formData({ ...validFields, access_level: "superuser" }),
      ),
    ).toEqual({ error: "Select a valid access level." });
  });

  test("accepts every documented access level", () => {
    expect(ACCESS_LEVELS).toEqual([
      "owner",
      "admin",
      "manager",
      "editor",
      "contributor",
      "viewer",
      "billing",
      "support",
      "custom",
    ]);

    for (const level of ACCESS_LEVELS) {
      const result = parseAccessGrantForm(
        formData({ ...validFields, access_level: level }),
      );
      expect("data" in result && result.data.access_level).toBe(level);
    }
  });
});
