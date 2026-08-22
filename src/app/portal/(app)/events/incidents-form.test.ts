import { describe, expect, test } from "bun:test";
import { parseIncidentForm } from "./incidents-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseIncidentForm", () => {
  test("requires a description", () => {
    expect(parseIncidentForm(formData({ severity: "minor" }))).toEqual({
      error: "A description of the incident is required.",
    });
  });

  test("rejects an invalid severity", () => {
    expect(parseIncidentForm(formData({ description: "Slipped on ice", severity: "extreme" }))).toEqual({
      error: "Select a valid severity.",
    });
  });

  test("defaults severity to minor", () => {
    const result = parseIncidentForm(formData({ description: "Minor scrape" }));
    expect("data" in result && result.data.severity).toBe("minor");
  });

  test("parses valid input", () => {
    const result = parseIncidentForm(
      formData({ description: "Twisted ankle", severity: "moderate", peopleInvolved: "Alex R." })
    );
    expect("data" in result && result.data.description).toBe("Twisted ankle");
    expect("data" in result && result.data.severity).toBe("moderate");
    expect("data" in result && result.data.people_involved).toBe("Alex R.");
  });
});
