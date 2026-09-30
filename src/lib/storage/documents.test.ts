import { describe, expect, test } from "bun:test";
import {
  checkDocumentFile,
  documentFileName,
  documentNameFromPath,
  isDocumentPath,
  isImageDocument,
} from "./documents";

const TENANT = "11111111-2222-4333-8444-555555555555";
const UPLOAD = "66666666-7777-4888-8999-aaaaaaaaaaaa";

describe("checkDocumentFile", () => {
  test("takes a PDF up to the bucket's cap and any image", () => {
    expect(
      checkDocumentFile({ name: "a.pdf", type: "application/pdf", size: 10 }),
    ).toEqual({ kind: "pdf" });
    expect(
      checkDocumentFile({ name: "a.heic", type: "image/heic", size: 9e7 }),
    ).toEqual({ kind: "image" });
  });

  test("refuses an oversized PDF and anything else", () => {
    expect(
      checkDocumentFile({
        name: "scan.pdf",
        type: "application/pdf",
        size: 11 * 1024 * 1024,
      }),
    ).toEqual({ error: "scan.pdf is larger than 10 MB. Link it instead." });
    expect(
      checkDocumentFile({
        name: "b.docx",
        type: "application/msword",
        size: 1,
      }),
    ).toEqual({ error: "b.docx is not a PDF or an image." });
  });
});

describe("documentFileName", () => {
  test("keeps a readable name with the stored extension", () => {
    expect(documentFileName("Bylaws (2024) final.PDF", "pdf")).toBe(
      "Bylaws-2024-final.pdf",
    );
    // An image is re-encoded, so a HEIC is stored and named as a JPEG.
    expect(documentFileName("IMG_0042.HEIC", "image")).toBe("IMG_0042.jpg");
  });

  test("never produces an empty or traversing segment", () => {
    expect(documentFileName("../..", "pdf")).toBe("document.pdf");
    expect(documentFileName("☃.pdf", "pdf")).toBe("document.pdf");
  });
});

describe("paths", () => {
  const path = `${TENANT}/governance/${UPLOAD}/Minutes.jpg`;

  test("reads the name and kind back off a stored path", () => {
    expect(documentNameFromPath(path)).toBe("Minutes.jpg");
    expect(isImageDocument(path)).toBe(true);
    expect(isImageDocument(`${TENANT}/governance/${UPLOAD}/a.pdf`)).toBe(false);
  });

  test("accepts only a minted path in the named module", () => {
    expect(isDocumentPath(path, "governance")).toBe(true);
    for (const bad of [
      `${TENANT}/finance/${UPLOAD}/Minutes.jpg`,
      `${TENANT}/governance/Minutes.jpg`,
      `${TENANT}/governance/${UPLOAD}/../x.jpg`,
      `/${TENANT}/governance/${UPLOAD}/Minutes.jpg`,
    ]) {
      expect(isDocumentPath(bad, "governance")).toBe(false);
    }
  });
});
