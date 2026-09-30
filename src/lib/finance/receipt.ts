import type { ParseResult } from "@/lib/forms";
import { isDocumentPath } from "@/lib/storage/documents";

export type ReceiptFields = {
  receipt_url: string | null;
  receipt_path: string | null;
};

/**
 * An expense's or reimbursement's receipt (#1490): `receiptUrl` or
 * `receiptPath`, never both -- the tables' `*_one_receipt` constraints say the
 * same. The path must look like one `createDocumentPathAction("receipts")`
 * minted; which tenant it sits under is the database's check to make.
 */
export function parseReceiptFields(
  formData: FormData,
): ParseResult<ReceiptFields> {
  const receiptUrl = String(formData.get("receiptUrl") ?? "").trim();
  const receiptPath = String(formData.get("receiptPath") ?? "").trim();

  if (receiptUrl && receiptPath) {
    return { error: "Attach a receipt link or a file, not both." };
  }
  if (receiptPath && !isDocumentPath(receiptPath, "receipts")) {
    return { error: "That receipt could not be attached. Upload it again." };
  }

  return {
    data: {
      receipt_url: receiptUrl || null,
      receipt_path: receiptPath || null,
    },
  };
}
