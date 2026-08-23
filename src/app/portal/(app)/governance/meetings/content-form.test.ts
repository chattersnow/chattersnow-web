import { describe, expect, test } from "bun:test";
import { parseContentForm } from "./content-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseContentForm", () => {
  test("allows both fields empty", () => {
    expect(parseContentForm(formData({}))).toEqual({
      data: { external_link: null, body_text: null },
    });
  });

  test("trims and keeps a link-only entry", () => {
    expect(parseContentForm(formData({ externalLink: " https://example.com/agenda.pdf " }))).toEqual({
      data: { external_link: "https://example.com/agenda.pdf", body_text: null },
    });
  });

  test("keeps a text-only entry", () => {
    expect(parseContentForm(formData({ bodyText: "1. Call to order\n2. Old business" }))).toEqual({
      data: { external_link: null, body_text: "1. Call to order\n2. Old business" },
    });
  });

  test("keeps both when provided", () => {
    expect(
      parseContentForm(formData({ externalLink: "https://example.com", bodyText: "Notes" }))
    ).toEqual({ data: { external_link: "https://example.com", body_text: "Notes" } });
  });
});
