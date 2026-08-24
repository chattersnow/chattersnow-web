"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseDiscountCodesForm } from "./discount-codes-form";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";

export type DiscountCodeRegistration = {
  id: string;
  name: string;
  email: string;
};

export type DiscountCode = {
  id: string;
  event_id: string;
  code: string;
  description: string | null;
  source: string | null;
  registration_id: string | null;
  assigned_at: string | null;
  notes: string | null;
  created_at: string;
  registration: DiscountCodeRegistration | null;
};

export type DiscountCodeActionResult = { error: string } | { success: true };

export async function listDiscountCodesAction(
  eventId: string,
): Promise<{ data: DiscountCode[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "events", "view");
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("discount_codes")
    .select(
      "id, event_id, code, description, source, registration_id, assigned_at, notes, created_at, registration:event_registrations(id, name, email)",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: "Could not load discount codes. Please try again." };
  }
  return { data: (data ?? []) as unknown as DiscountCode[] };
}

export async function createDiscountCodesAction(
  eventId: string,
  formData: FormData,
): Promise<DiscountCodeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add discount codes.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const parsed = parseDiscountCodesForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase.from("discount_codes").insert(
    parsed.data.codes.map((code) => ({
      event_id: eventId,
      code,
      description: parsed.data.description,
      source: parsed.data.source,
    })),
  );

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "One or more of these codes are already recorded for this event.",
      };
    }
    return { error: "Could not save these codes. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function assignDiscountCodeAction(
  id: string,
  registrationId: string | null,
): Promise<DiscountCodeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to assign a discount code.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("discount_codes")
    .update({
      registration_id: registrationId,
      assigned_at: registrationId ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "This registrant already has a code assigned. Unassign it first.",
      };
    }
    return { error: "Could not assign this code. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

export async function deleteDiscountCodeAction(
  id: string,
): Promise<DiscountCodeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to remove a discount code.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(supabase, "events", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase.from("discount_codes").delete().eq("id", id);

  if (error) {
    return { error: "Could not remove this code. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
