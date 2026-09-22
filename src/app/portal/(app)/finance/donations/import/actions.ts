"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { getOrgTimeZone } from "@/lib/org-timezone";
import {
  mappingError,
  parseDonationImportCsv,
  type DonationImportMapping,
  type DonationImportRow,
} from "./donation-import-row";

export type DonationImportResult =
  | { error: string }
  | {
      success: true;
      /** New rows written. */
      inserted: number;
      /** Rows whose transaction id this tenant already had. */
      duplicates: number;
      /** Rows the file itself could not offer — unreadable, or incomplete. */
      invalid: number;
    };

/**
 * What each SCREAMING_SNAKE code from `bulk_import_monetary_donations` means
 * in a sentence. Same shape as the giving settings' map in ../actions.ts, and
 * for the same reason: the database is where the guarantee holds, and this is
 * what turns its answer into something a treasurer can act on.
 */
const IMPORT_ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "You don't have permission to import donations.",
  IMPORT_ROWS_INVALID: "That file could not be read. Parse it again.",
  IMPORT_EMPTY: "There are no rows to import.",
  IMPORT_TOO_MANY_ROWS:
    "That is more than 500 rows. Split the export into smaller files — a month at a time is the usual shape.",
  PROCESSOR_LABEL_TOO_LONG:
    "The provider's name must be 60 characters or fewer.",
  IMPORT_REFERENCE_REQUIRED: "Every row needs the provider's transaction ID.",
  IMPORT_REFERENCE_TOO_LONG:
    "One transaction ID is longer than 200 characters.",
  IMPORT_AMOUNT_INVALID: "One row's amount isn't a number we can record.",
  IMPORT_GROSS_INVALID: "One row's gross amount isn't a number we can record.",
  IMPORT_FEE_INVALID: "One row's fee isn't a number we can record.",
  IMPORT_AMOUNT_MISMATCH:
    "One row's amount isn't its gross amount minus its fee.",
  IMPORT_RECEIVED_AT_REQUIRED: "Every row needs the date it was received.",
  IMPORT_RECEIVED_AT_INVALID: "One row's date isn't one we can read.",
  IMPORT_MAPPING_INVALID:
    "Those columns could not be saved. Choose them again.",
};

/**
 * Imports a processor's CSV export into `monetary_donations`.
 *
 * **The CSV text is sent, not the parsed rows** — which is where this differs
 * from `bulkImportCalendarItemsAction`, whose client sends the rows it parsed
 * and whose action then re-validates them against the same rules. Re-validating
 * a client's parse only proves the client applied the rules; parsing the file
 * here proves the numbers written are the file's. It also puts the org's own
 * time zone on the server side of the boundary, so the day a gift reports under
 * is never a browser's idea of it.
 *
 * Rows the file cannot offer are **skipped and counted**, not fatal: a month's
 * export routinely carries a refund line or a blank tail, and refusing 240 good
 * rows over two bad ones would send the reader to a spreadsheet to fix a file
 * the preview already showed them.
 */
export async function importDonationsAction(
  csvText: string,
  mapping: DonationImportMapping,
  processorLabel: string,
): Promise<DonationImportResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance", "manage");
  if (permissionError) return permissionError;

  if (!csvText.trim()) return { error: "There is nothing to import." };

  const mappingProblem = mappingError(mapping);
  if (mappingProblem) return { error: mappingProblem };

  const timeZone = await getOrgTimeZone(supabase);
  const { rows, totalRows } = parseDonationImportCsv(
    csvText,
    mapping,
    timeZone,
  );
  if (totalRows === 0) return { error: "There are no rows to import." };

  const valid = rows.filter(
    (row): row is { data: DonationImportRow } => "data" in row,
  );
  const invalid = rows.length - valid.length;
  if (valid.length === 0) {
    return {
      error: "No row in that file could be imported. Check the columns.",
    };
  }

  const { data, error } = await supabase.rpc("bulk_import_monetary_donations", {
    p_rows: valid.map((row) => ({
      external_reference: row.data.externalReference,
      amount: row.data.amount,
      gross_amount: row.data.grossAmount,
      fee_amount: row.data.feeAmount,
      // The instant, not the day. The RPC buckets it onto the org's own day
      // itself, so there is one place that decides which month a gift falls
      // in rather than two that have to agree.
      received_at: row.data.receivedAt,
      notes: row.data.notes,
    })),
    p_processor_label: processorLabel.trim(),
  });

  if (error) {
    return {
      error:
        IMPORT_ERROR_MESSAGES[error.message] ??
        "Could not import those donations. Please try again.",
    };
  }

  const counts = (data ?? {}) as { inserted?: number; skipped?: number };
  const inserted = Number(counts.inserted ?? 0);

  // Remembered only after a successful import, so a mapping that turned out to
  // be wrong is not the one waiting next month. A failure here is not the
  // import's failure -- the money is recorded either way -- so it is logged
  // rather than returned.
  const { error: mappingSaveError } = await supabase.rpc(
    "set_donation_import_mapping",
    { p_mapping: mapping },
  );
  if (mappingSaveError) {
    console.error(
      "[donation-import] could not remember the column mapping",
      mappingSaveError,
    );
  }

  revalidatePath("/portal/finance/donations");
  revalidatePath("/portal/finance/donations/import");
  revalidatePath("/portal/finance/reports");

  return {
    success: true,
    inserted,
    duplicates: Number(counts.skipped ?? 0),
    invalid,
  };
}
