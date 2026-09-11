"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { parseRecordSaleInput, parseSaleEditForm } from "./sale-form";
import {
  SALE_COLUMNS,
  saleRpcErrorMessage,
  type SaleRow,
} from "./sales-shared";

export type SaleActionResult = { error: string } | { success: true };

export type RecordSaleResult =
  { error: string } | { success: true; saleId: string; total: number };

/**
 * A recorded sale moves stock, so it invalidates more than its own page: the
 * register's tiles show "N left", the Products admin shows the same figure,
 * the event's Sales tab reads the ledger, and the dashboard counts income.
 */
function revalidateSales() {
  for (const path of [
    "/portal/finance/sales",
    "/portal/finance/sales/register",
    "/portal/finance/sales/products",
    "/portal/events",
    "/portal/home",
  ]) {
    revalidatePath(path);
  }
}

export async function recordSaleAction(
  input: unknown,
): Promise<RecordSaleResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "sales", "manage");
  if (permissionError) return permissionError;

  const parsed = parseRecordSaleInput(input);
  if ("error" in parsed) return parsed;

  // The RPC owns the rest: it prices the lines from the catalog, refuses a
  // variant that is retired or short of stock, writes the sale and its line
  // items, and decrements stock -- all inside one transaction holding a row
  // lock on each variant. Nothing about the money comes from the client.
  const { data, error } = await supabase
    .rpc("record_product_sale", {
      p_event_id: parsed.data.event_id,
      p_purchaser_person_id: parsed.data.purchaser_person_id,
      p_payment_method: parsed.data.payment_method,
      p_discount_amount: parsed.data.discount_amount,
      p_sold_at: null,
      p_notes: parsed.data.notes,
      p_lines: parsed.data.lines,
    })
    .single();

  if (error || !data) {
    return { error: saleRpcErrorMessage(error) };
  }

  revalidateSales();
  const recorded = data as { sale_id: string; total: number | string };
  return {
    success: true,
    saleId: recorded.sale_id,
    total: Number(recorded.total),
  };
}

export async function voidSaleAction(
  saleId: string,
  reason: string,
): Promise<SaleActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "sales", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.rpc("void_product_sale", {
    p_sale_id: saleId,
    p_reason: reason.trim() || null,
  });

  if (error) {
    return {
      error: saleRpcErrorMessage(
        error,
        "Could not void the sale. Please try again.",
      ),
    };
  }

  revalidateSales();
  return { success: true };
}

/**
 * Corrects which event a sale belongs to, who bought it, or what the note
 * says. Those three columns are the whole of `sales`'s update grant -- a
 * change to money or stock is a void and a re-ring, not an edit.
 */
export async function updateSaleAction(
  saleId: string,
  formData: FormData,
): Promise<SaleActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "sales", "manage");
  if (permissionError) return permissionError;

  const parsed = parseSaleEditForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("sales")
    .update(parsed.data)
    .eq("id", saleId);

  if (error) {
    return { error: "Could not save the sale. Please try again." };
  }

  revalidateSales();
  return { success: true };
}

export async function listEventSalesAction(
  eventId: string,
): Promise<{ data: SaleRow[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "sales", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("sales")
    .select(SALE_COLUMNS)
    .eq("event_id", eventId)
    .order("sold_at", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    return { error: "Could not load sales for this event. Please try again." };
  }
  return { data: (data ?? []) as unknown as SaleRow[] };
}
