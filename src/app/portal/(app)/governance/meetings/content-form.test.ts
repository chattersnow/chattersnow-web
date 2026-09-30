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
      data: { external_link: null, document_path: null, body_text: null },
    });
  });

  test("trims and keeps a link-only entry", () => {
    expect(
      parseContentForm(
        formData({ externalLink: " https://example.com/agenda.pdf " }),
      ),
    ).toEqual({
      data: {
        external_link: "https://example.com/agenda.pdf",
        document_path: null,
        body_text: null,
      },
    });
  });

  test("keeps a text-only entry", () => {
    expect(
      parseContentForm(
        formData({ bodyText: "1. Call to order\n2. Old business" }),
      ),
    ).toEqual({
      data: {
        external_link: null,
        document_path: null,
        body_text: "1. Call to order\n2. Old business",
      },
    });
  });

  test("keeps both when provided", () => {
    expect(
      parseContentForm(
        formData({ externalLink: "https://example.com", bodyText: "Notes" }),
      ),
    ).toEqual({
      data: {
        external_link: "https://example.com",
        document_path: null,
        body_text: "Notes",
      },
    });
  });

  const TENANT = "11111111-2222-4333-8444-555555555555";
  const UPLOAD = "66666666-7777-4888-8999-aaaaaaaaaaaa";
  const PATH = `${TENANT}/governance/${UPLOAD}/Bylaws-2024.pdf`;

  test("keeps an uploaded file's path", () => {
    expect(parseContentForm(formData({ documentPath: PATH }))).toEqual({
      data: { external_link: null, document_path: PATH, body_text: null },
    });
  });

  test("refuses a link and a file together", () => {
    expect(
      parseContentForm(
        formData({ externalLink: "https://example.com", documentPath: PATH }),
      ),
    ).toEqual({ error: "Attach a link or a file, not both." });
  });

  test("refuses a path that isn't a governance upload", () => {
    for (const documentPath of [
      `${TENANT}/finance/${UPLOAD}/receipt.pdf`,
      `${TENANT}/governance/../x.pdf`,
      "https://example.com/file.pdf",
    ]) {
      expect(parseContentForm(formData({ documentPath }))).toEqual({
        error: "That file could not be attached. Upload it again.",
      });
    }
  });
});
