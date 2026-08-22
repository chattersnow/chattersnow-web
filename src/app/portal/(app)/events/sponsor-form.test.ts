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
      parseSponsorForm(formData({ supportType: "cash", contributionValue: "-1" }))
    ).toEqual({ error: "Contribution value must be a positive number." });
  });

  test("treats isPublic=on as public", () => {
    const result = parseSponsorForm(formData({ supportType: "cash", isPublic: "on" }));
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
        inKindDescription: "Tents",
        contributionValue: "500",
        isPublic: "true",
        notes: "Annual sponsor",
      })
    );
    expect(result).toEqual({
      data: {
        support_type: "both",
        in_kind_description: "Tents",
        contribution_value: 500,
        is_public: true,
        notes: "Annual sponsor",
        follow_up_status: "not_started",
        follow_up_notes: null,
      },
    });
  });

  test("rejects an invalid follow-up status", () => {
    expect(
      parseSponsorForm(formData({ supportType: "cash", followUpStatus: "later" }))
    ).toEqual({ error: "Select a valid follow-up status." });
  });

  test("parses follow-up fields", () => {
    const result = parseSponsorForm(
      formData({ supportType: "cash", followUpStatus: "done", followUpNotes: "Sent thank-you" })
    );
    expect("data" in result && result.data.follow_up_status).toBe("done");
    expect("data" in result && result.data.follow_up_notes).toBe("Sent thank-you");
  });
});
