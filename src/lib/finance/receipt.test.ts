import { describe, expect, test } from "bun:test";
import { parseReceiptFields } from "./receipt";

const TENANT = "11111111-2222-4333-8444-555555555555";
const UPLOAD = "66666666-7777-4888-9999-000000000000";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseReceiptFields", () => {
  test("neither is fine", () => {
    expect(parseReceiptFields(formData({}))).toEqual({
      data: { receipt_url: null, receipt_path: null },
    });
  });

  test("takes a link", () => {
    expect(
      parseReceiptFields(formData({ receiptUrl: " https://x.test/r.pdf " })),
    ).toEqual({
      data: { receipt_url: "https://x.test/r.pdf", receipt_path: null },
    });
  });

  test("takes a receipts path", () => {
    const path = `${TENANT}/receipts/${UPLOAD}/receipt.jpg`;
    expect(parseReceiptFields(formData({ receiptPath: path }))).toEqual({
      data: { receipt_url: null, receipt_path: path },
    });
  });

  test("refuses a link and a path together", () => {
    expect(
      parseReceiptFields(
        formData({
          receiptUrl: "https://x.test/r.pdf",
          receiptPath: `${TENANT}/receipts/${UPLOAD}/receipt.jpg`,
        }),
      ),
    ).toEqual({ error: "Attach a receipt link or a file, not both." });
  });

  test("refuses a path outside the receipts folder", () => {
    for (const path of [
      `${TENANT}/governance/${UPLOAD}/bylaws.pdf`,
      "../receipt.jpg",
    ]) {
      expect(parseReceiptFields(formData({ receiptPath: path }))).toEqual({
        error: "That receipt could not be attached. Upload it again.",
      });
    }
  });
});
