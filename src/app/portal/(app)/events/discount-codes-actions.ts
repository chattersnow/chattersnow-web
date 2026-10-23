"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseDiscountCodeDetails,
  parseDiscountCodePin,
  parseDiscountCodesForm,
  parseSharedDiscountCodeForm,
  type DiscountCodeCoverage,
} from "./discount-codes-form";
import { checkEventAccess } from "@/lib/auth/event-access";
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
  kind: string | null;
  value: number | string | null;
  /** The event's one group code (#1589); never assigned. */
  shared: boolean;
  /** The partner's redemption PIN, shown wherever the code is (#1589). */
  pin: string | null;
  /** The registration options it covers, and by what percentage (#1589). */
  coverage: { option_id: string; percent_off: number | string }[];
  registration_id: string | null;
  assigned_at: string | null;
  sent_at: string | null;
  sent_to_name: string | null;
  sent_to_email: string | null;
  notes: string | null;
  created_at: string;
  registration: DiscountCodeRegistration | null;
};

export type DiscountCodeActionResult = { error: string } | { success: true };

export async function listDiscountCodesAction(
  eventId: string,
): Promise<{ data: DiscountCode[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkEventAccess(supabase, {
    table: "discount_codes",
    level: "view",
    eventId,
  });
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("discount_codes")
    .select(
      "id, event_id, code, description, source, kind, value, shared, pin, registration_id, assigned_at, sent_at, sent_to_name, sent_to_email, notes, created_at, registration:event_registrations(id, name, email), coverage:discount_code_options(option_id, percent_off)",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return { error: "Could not load discount codes. Please try again." };
  }
  return { data: (data ?? []) as unknown as DiscountCode[] };
}

/**
 * Replaces the options a code covers (#1589). RLS holds the same
 * events:manage the code itself does, and a trigger refuses an option from
 * another event.
 */
async function saveCoverage(
  supabase: SupabaseClient,
  codeIds: string[],
  coverage: DiscountCodeCoverage[],
): Promise<boolean> {
  const { error: deleteError } = await supabase
    .from("discount_code_options")
    .delete()
    .in("code_id", codeIds);
  if (deleteError) return false;
  if (coverage.length === 0) return true;
  const { error } = await supabase.from("discount_code_options").insert(
    codeIds.flatMap((codeId) =>
      coverage.map(({ optionId, percentOff }) => ({
        code_id: codeId,
        option_id: optionId,
        percent_off: percentOff,
      })),
    ),
  );
  return !error;
}

const COVERAGE_SAVE_ERROR =
  "The code was saved, but not the options it covers. Edit it to try again.";

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
  const permissionError = await checkEventAccess(supabase, {
    table: "discount_codes",
    level: "manage",
    eventId,
  });
  if (permissionError) return permissionError;

  const parsed = parseDiscountCodesForm(formData);
  if ("error" in parsed) return parsed;

  const { data: created, error } = await supabase
    .from("discount_codes")
    .insert(
      parsed.data.codes.map(({ code, pin }) => ({
        event_id: eventId,
        code,
        pin,
        description: parsed.data.description,
        source: parsed.data.source,
        kind: parsed.data.kind,
        value: parsed.data.value,
      })),
    )
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "One or more of these codes are already recorded for this event.",
      };
    }
    return { error: "Could not save these codes. Please try again." };
  }

  if (
    parsed.data.coverage.length > 0 &&
    !(await saveCoverage(
      supabase,
      (created ?? []).map((row) => row.id),
      parsed.data.coverage,
    ))
  ) {
    revalidatePath("/portal/events");
    return { error: COVERAGE_SAVE_ERROR };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

/**
 * The event's one shared code (#1589): given to everyone who registers, and
 * carried by the confirmation email rather than assigned.
 */
export async function createSharedDiscountCodeAction(
  eventId: string,
  formData: FormData,
): Promise<DiscountCodeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to add a shared code.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkEventAccess(supabase, {
    table: "discount_codes",
    level: "manage",
    eventId,
  });
  if (permissionError) return permissionError;

  const parsed = parseSharedDiscountCodeForm(formData);
  if ("error" in parsed) return parsed;

  const { data: created, error } = await supabase
    .from("discount_codes")
    .insert({
      event_id: eventId,
      shared: true,
      code: parsed.data.code,
      pin: parsed.data.pin,
      description: parsed.data.description,
      source: parsed.data.source,
      kind: parsed.data.kind,
      value: parsed.data.value,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        error: error.message.includes("discount_codes_one_shared_per_event")
          ? "This event already has a shared code. Edit that one instead."
          : "This code is already recorded for this event.",
      };
    }
    return { error: "Could not save the shared code. Please try again." };
  }

  if (
    parsed.data.coverage.length > 0 &&
    !(await saveCoverage(supabase, [created.id], parsed.data.coverage))
  ) {
    revalidatePath("/portal/events");
    return { error: COVERAGE_SAVE_ERROR };
  }

  revalidatePath("/portal/events");
  return { success: true };
}

/**
 * A code's description, source, kind, value, PIN and the options it covers --
 * never the code itself.
 */
export async function updateDiscountCodeAction(
  id: string,
  formData: FormData,
): Promise<DiscountCodeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to edit a discount code.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkEventAccess(supabase, {
    table: "discount_codes",
    level: "manage",
  });
  if (permissionError) return permissionError;

  const parsed = parseDiscountCodeDetails(formData);
  if ("error" in parsed) return parsed;
  const pin = parseDiscountCodePin(formData);
  if ("error" in pin) return pin;

  const { coverage, ...details } = parsed.data;
  const { error } = await supabase
    .from("discount_codes")
    .update({ ...details, pin: pin.data })
    .eq("id", id);

  if (error) {
    return { error: "Could not save this code. Please try again." };
  }

  if (!(await saveCoverage(supabase, [id], coverage))) {
    revalidatePath("/portal/events");
    return { error: COVERAGE_SAVE_ERROR };
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
  const permissionError = await checkEventAccess(supabase, {
    table: "discount_codes",
    level: "manage",
  });
  if (permissionError) return permissionError;

  const { data: existing, error: fetchError } = await supabase
    .from("discount_codes")
    .select("sent_at, shared")
    .eq("id", id)
    .maybeSingle();
  if (fetchError || !existing) {
    return { error: "Could not find this code. Please try again." };
  }
  if (existing.shared) {
    return {
      error:
        "The shared code goes to everyone who registers, so it can't be assigned.",
    };
  }
  if (existing.sent_at) {
    return {
      error: "This code has already been sent and can't be reassigned.",
    };
  }

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

export async function markDiscountCodeSentAction(
  id: string,
): Promise<DiscountCodeActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to mark a discount code as sent.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkEventAccess(supabase, {
    table: "discount_codes",
    level: "manage",
  });
  if (permissionError) return permissionError;

  const { data: code, error: fetchError } = await supabase
    .from("discount_codes")
    .select("registration_id, registration:event_registrations(name, email)")
    .eq("id", id)
    .maybeSingle<{
      registration_id: string | null;
      registration: { name: string; email: string } | null;
    }>();

  if (fetchError || !code) {
    return { error: "Could not find this code. Please try again." };
  }
  if (!code.registration_id || !code.registration) {
    return {
      error: "Assign this code to a registrant before marking it sent.",
    };
  }

  const { error } = await supabase
    .from("discount_codes")
    .update({
      sent_at: new Date().toISOString(),
      sent_to_name: code.registration.name,
      sent_to_email: code.registration.email,
    })
    .eq("id", id);

  if (error) {
    return { error: "Could not mark this code as sent. Please try again." };
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
  const permissionError = await checkEventAccess(supabase, {
    table: "discount_codes",
    level: "manage",
  });
  if (permissionError) return permissionError;

  const { error } = await supabase.from("discount_codes").delete().eq("id", id);

  if (error) {
    return { error: "Could not remove this code. Please try again." };
  }

  revalidatePath("/portal/events");
  return { success: true };
}
