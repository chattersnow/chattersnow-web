import { describe, expect, test } from "bun:test";
import { parseTemplateForm, parseTemplateFieldsForm } from "./template-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseTemplateForm", () => {
  test("parses valid input", () => {
    const result = parseTemplateForm(
      formData({
        key: "community_spotlight",
        name: "Community spotlight",
        description: "Spotlight a person or group.",
        isActive: "true",
        requiresConsent: "true",
      }),
    );
    expect("data" in result && result.data).toEqual({
      key: "community_spotlight",
      name: "Community spotlight",
      description: "Spotlight a person or group.",
      isActive: true,
      requiresConsent: true,
    });
  });

  test("defaults requiresConsent to false when absent", () => {
    const result = parseTemplateForm(formData({ key: "foo", name: "Foo" }));
    expect("data" in result && result.data.requiresConsent).toBe(false);
  });

  test("trims fields and treats blank description as null", () => {
    const result = parseTemplateForm(
      formData({ key: "foo", name: "  Foo  ", description: "  " }),
    );
    expect("data" in result && result.data.name).toBe("Foo");
    expect("data" in result && result.data.description).toBeNull();
  });

  test("requires a key", () => {
    expect(parseTemplateForm(formData({ key: "", name: "Foo" }))).toEqual({
      error: "Template key is required.",
    });
  });

  test("rejects a badly-cased key", () => {
    expect(
      parseTemplateForm(formData({ key: "Community Spotlight", name: "Foo" })),
    ).toEqual({
      error:
        "Template key must be lowercase letters, numbers, and underscores, starting with a letter.",
    });
  });

  test("requires a name", () => {
    expect(parseTemplateForm(formData({ key: "foo", name: "" }))).toEqual({
      error: "Template name is required.",
    });
  });
});

const validField = { key: "quote", label: "Quote", help_text: null };

describe("parseTemplateFieldsForm", () => {
  test("parses a valid field list", () => {
    const fd = new FormData();
    fd.set("fields", JSON.stringify([validField]));
    const result = parseTemplateFieldsForm(fd);
    expect("data" in result && result.data).toEqual([validField]);
  });

  test("requires a non-empty array", () => {
    const fd = new FormData();
    fd.set("fields", JSON.stringify([]));
    expect(parseTemplateFieldsForm(fd)).toEqual({
      error: "A template needs at least one field.",
    });
  });

  test("rejects malformed JSON", () => {
    const fd = new FormData();
    fd.set("fields", "not json");
    expect(parseTemplateFieldsForm(fd)).toEqual({
      error: "Could not read the field list. Please try again.",
    });
  });

  test("rejects a missing key", () => {
    const fd = new FormData();
    fd.set("fields", JSON.stringify([{ key: "", label: "Quote" }]));
    expect(parseTemplateFieldsForm(fd)).toEqual({
      error:
        "Field 1: key must be lowercase letters, numbers, and underscores, starting with a letter.",
    });
  });

  test("rejects a badly-cased key", () => {
    const fd = new FormData();
    fd.set("fields", JSON.stringify([{ key: "Quote", label: "Quote" }]));
    expect(parseTemplateFieldsForm(fd)).toEqual({
      error:
        "Field 1: key must be lowercase letters, numbers, and underscores, starting with a letter.",
    });
  });

  test("rejects a missing label", () => {
    const fd = new FormData();
    fd.set("fields", JSON.stringify([{ key: "quote", label: "" }]));
    expect(parseTemplateFieldsForm(fd)).toEqual({
      error: "Field 1: label is required.",
    });
  });

  test("rejects duplicate keys", () => {
    const fd = new FormData();
    fd.set(
      "fields",
      JSON.stringify([
        { key: "quote", label: "Quote" },
        { key: "quote", label: "Quote again" },
      ]),
    );
    expect(parseTemplateFieldsForm(fd)).toEqual({
      error: 'Field key "quote" is used more than once.',
    });
  });
});
