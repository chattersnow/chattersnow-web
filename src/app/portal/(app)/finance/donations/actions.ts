"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseDonationForm } from "./donation-form";
import { checkPermission } from "@/lib/auth/permissions";
import {
  AMOUNT_PARAM_PATTERN,
  givingUrlError,
  isGivingMode,
  MAX_GIVING_URL_LENGTH,
  MAX_PROVIDER_LABEL_LENGTH,
  MAX_SUGGESTED_AMOUNT,
  MAX_SUGGESTED_AMOUNTS,
  parseSuggestedAmounts,
  type GivingMode,
} from "@/lib/giving";

export type DonationActionResult = { error: string } | { success: true };

function revalidateDonationPaths() {
  revalidatePath("/portal/finance/donations");
  revalidatePath("/portal/finance/reports");
}

export async function createDonationAction(
  formData: FormData,
): Promise<DonationActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance", "manage");
  if (permissionError) return permissionError;

  const parsed = parseDonationForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("monetary_donations")
    .insert(parsed.data);
  if (error) {
    return { error: "Could not save the donation. Please try again." };
  }

  revalidateDonationPaths();
  return { success: true };
}

export async function updateDonationAction(
  id: string,
  formData: FormData,
): Promise<DonationActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance", "manage");
  if (permissionError) return permissionError;

  const parsed = parseDonationForm(formData);
  if ("error" in parsed) return parsed;

  const { error } = await supabase
    .from("monetary_donations")
    .update(parsed.data)
    .eq("id", id);
  if (error) {
    return { error: "Could not update the donation. Please try again." };
  }

  revalidateDonationPaths();
  return { success: true };
}

export async function deleteDonationAction(
  id: string,
): Promise<DonationActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance", "manage");
  if (permissionError) return permissionError;

  const { error } = await supabase
    .from("monetary_donations")
    .delete()
    .eq("id", id);
  if (error) {
    return { error: "Could not delete the donation. Please try again." };
  }

  revalidateDonationPaths();
  return { success: true };
}

// ---------------------------------------------------------------------------
// The giving path (#1389)
// ---------------------------------------------------------------------------

export type GivingSettingsInput = {
  enabled: boolean;
  providerLabel: string;
  url: string;
  mode: GivingMode;
  suggestedAmounts: number[];
  amountParam: string;
  recurringAvailable: boolean;
};

const GIVING_ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "You don't have permission to change these settings.",
  PROVIDER_LABEL_TOO_LONG: `The provider's name must be ${MAX_PROVIDER_LABEL_LENGTH} characters or fewer.`,
  GIVING_MODE_INVALID: "Choose how the giving page opens.",
  GIVING_URL_INVALID:
    "That is not a web address we can publish. It has to start with https:// and name a real site.",
  GIVING_URL_TOO_LONG: `The address must be ${MAX_GIVING_URL_LENGTH} characters or fewer.`,
  GIVING_URL_REQUIRED:
    "Paste the address of your giving page before switching giving on.",
  GIVING_AMOUNTS_INVALID: `Suggested amounts are up to ${MAX_SUGGESTED_AMOUNTS} whole amounts, each between 1 and ${MAX_SUGGESTED_AMOUNT}.`,
  GIVING_AMOUNT_PARAM_INVALID:
    "The amount parameter is the name your provider uses in its own web address, e.g. amount.",
};

/**
 * The seven `giving.*` settings, written through set_giving_settings() --
 * gated on finance:manage rather than the app_settings table's own
 * system_settings:manage, because this panel lives with the feature
 * (docs/portal-navigation.md), exactly as the gear-request settings do.
 *
 * Everything checked here is checked again in the RPC. That is not belt and
 * braces for its own sake: `giving.url` ends up as an `href` on a public page,
 * so the database is where the guarantee has to hold -- a raw PostgREST write
 * must not be able to publish a `javascript:` URL. What this function adds is
 * a sentence instead of a raw error.
 */
export async function updateGivingSettingsAction(
  input: GivingSettingsInput,
): Promise<DonationActionResult> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkPermission(supabase, "finance", "manage");
  if (permissionError) return permissionError;

  const providerLabel = input.providerLabel.trim();
  if (providerLabel.length > MAX_PROVIDER_LABEL_LENGTH) {
    return { error: GIVING_ERROR_MESSAGES.PROVIDER_LABEL_TOO_LONG };
  }
  if (!isGivingMode(input.mode)) {
    return { error: GIVING_ERROR_MESSAGES.GIVING_MODE_INVALID };
  }

  const url = input.url.trim();
  if (url) {
    const urlError = givingUrlError(url);
    if (urlError) return { error: urlError };
  } else if (input.enabled) {
    return { error: GIVING_ERROR_MESSAGES.GIVING_URL_REQUIRED };
  }

  // parseSuggestedAmounts drops anything the RPC would refuse, so comparing
  // its output with what came in is how a typo gets a sentence rather than a
  // silently shorter list of buttons.
  const amounts = parseSuggestedAmounts(input.suggestedAmounts);
  if (amounts.length !== input.suggestedAmounts.length) {
    return { error: GIVING_ERROR_MESSAGES.GIVING_AMOUNTS_INVALID };
  }

  const amountParam = input.amountParam.trim();
  if (amountParam && !AMOUNT_PARAM_PATTERN.test(amountParam)) {
    return { error: GIVING_ERROR_MESSAGES.GIVING_AMOUNT_PARAM_INVALID };
  }

  const { error } = await supabase.rpc("set_giving_settings", {
    p_enabled: input.enabled,
    p_provider_label: providerLabel,
    p_url: url,
    p_mode: input.mode,
    p_suggested_amounts: amounts,
    p_amount_param: amountParam,
    p_recurring_available: input.recurringAvailable,
  });

  if (error) {
    return {
      error:
        GIVING_ERROR_MESSAGES[error.message] ??
        "Could not save these settings. Please try again.",
    };
  }

  revalidatePath("/portal/finance/donations");
  // Three public surfaces read this: the Give card, the Support landing card
  // and the stable redirect.
  revalidatePath("/support");
  revalidatePath("/support/donations");
  revalidatePath("/support/donate");
  return { success: true };
}
