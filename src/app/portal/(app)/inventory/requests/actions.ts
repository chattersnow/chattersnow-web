"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  MAX_DELIVERY_INSTRUCTIONS_LENGTH,
  MAX_PAYMENT_METHODS,
  MAX_PAYMENT_METHOD_HANDLE_LENGTH,
  MAX_PAYMENT_METHOD_INSTRUCTIONS_LENGTH,
  MAX_PAYMENT_METHOD_LABEL_LENGTH,
  PAYMENT_METHOD_KEY_PATTERN,
  isGearRequestStatus,
  type GearRequestStatus,
  type PaymentMethod,
} from "@/lib/gear-requests";

export type GearRequestActionResult = { error: string } | { success: true };

const REQUESTS_PATH = "/portal/inventory/requests";

const STATUS_ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "You don't have permission to update requests.",
  REQUEST_NOT_FOUND: "This request could not be found.",
  REQUEST_CLOSED: "This request is already fulfilled or cancelled.",
  NOT_SHIPPING: "Only a shipping request has a postage quote.",
  QUOTE_AMOUNT_REQUIRED: "Enter the postage amount to record a quote.",
  QUOTE_REQUIRED: "Record the postage quote before marking it paid.",
  STATUS_INVALID: "That is not a status a request can move to.",
};

/**
 * Every status change goes through set_gear_request_status(), which
 * re-checks inventory:manage, refuses a closed request, and on cancellation
 * releases the items the request was still holding -- so the check here is
 * only to answer with a sentence instead of a raw PostgREST error.
 */
export async function setGearRequestStatusAction(
  requestId: string,
  status: GearRequestStatus,
  quotedAmount: number | null = null,
): Promise<GearRequestActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update requests.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "inventory",
    "manage",
  );
  if (permissionError) return permissionError;

  if (!isGearRequestStatus(status) || status === "new") {
    return { error: STATUS_ERROR_MESSAGES.STATUS_INVALID };
  }
  if (status === "quoted") {
    if (
      quotedAmount === null ||
      !Number.isFinite(quotedAmount) ||
      quotedAmount < 0
    ) {
      return { error: STATUS_ERROR_MESSAGES.QUOTE_AMOUNT_REQUIRED };
    }
  }

  const { error } = await supabase.rpc("set_gear_request_status", {
    p_request_id: requestId,
    p_status: status,
    p_quoted_amount: status === "quoted" ? quotedAmount : null,
  });

  if (error) {
    return {
      error:
        STATUS_ERROR_MESSAGES[error.message] ??
        "Could not update this request. Please try again.",
    };
  }

  revalidatePath(REQUESTS_PATH);
  revalidatePath(`${REQUESTS_PATH}/${requestId}`);
  // A cancellation puts items back in the catalogue, public and portal.
  if (status === "cancelled") {
    revalidatePath("/portal/inventory/items");
    revalidatePath("/inventory/library");
  }
  return { success: true };
}

export type GearRequestSettingsInput = {
  shippingEnabled: boolean;
  paymentMethods: PaymentMethod[];
  meetupInstructions: string;
  shippingInstructions: string;
};

const SETTINGS_ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "You don't have permission to change these settings.",
  PAYMENT_METHODS_INVALID:
    "Each payment method needs a name, and the names must be distinct.",
  INSTRUCTIONS_TOO_LONG: `Instructions must be ${MAX_DELIVERY_INSTRUCTIONS_LENGTH} characters or fewer.`,
};

/**
 * The four `gear_requests.*` settings, written through
 * set_gear_request_settings() -- gated on inventory:manage rather than the
 * app_settings table's own system_settings:manage, because this panel lives
 * with the feature (docs/portal-navigation.md).
 */
export async function updateGearRequestSettingsAction(
  input: GearRequestSettingsInput,
): Promise<GearRequestActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to change these settings.",
  );
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "inventory",
    "manage",
  );
  if (permissionError) return permissionError;

  if (input.paymentMethods.length > MAX_PAYMENT_METHODS) {
    return {
      error: `List up to ${MAX_PAYMENT_METHODS} payment methods.`,
    };
  }
  const seen = new Set<string>();
  const methods: PaymentMethod[] = [];
  for (const method of input.paymentMethods) {
    const label = method.label.trim();
    if (!label) return { error: "Each payment method needs a name." };
    if (label.length > MAX_PAYMENT_METHOD_LABEL_LENGTH) {
      return {
        error: `Payment method names must be ${MAX_PAYMENT_METHOD_LABEL_LENGTH} characters or fewer.`,
      };
    }
    if (!PAYMENT_METHOD_KEY_PATTERN.test(method.key) || seen.has(method.key)) {
      return { error: SETTINGS_ERROR_MESSAGES.PAYMENT_METHODS_INVALID };
    }
    seen.add(method.key);
    const handle = method.handle.trim();
    const instructions = method.instructions.trim();
    if (handle.length > MAX_PAYMENT_METHOD_HANDLE_LENGTH) {
      return {
        error: `Handles must be ${MAX_PAYMENT_METHOD_HANDLE_LENGTH} characters or fewer.`,
      };
    }
    if (instructions.length > MAX_PAYMENT_METHOD_INSTRUCTIONS_LENGTH) {
      return {
        error: `Payment instructions must be ${MAX_PAYMENT_METHOD_INSTRUCTIONS_LENGTH} characters or fewer.`,
      };
    }
    methods.push({ key: method.key, label, handle, instructions });
  }
  if (
    input.meetupInstructions.length > MAX_DELIVERY_INSTRUCTIONS_LENGTH ||
    input.shippingInstructions.length > MAX_DELIVERY_INSTRUCTIONS_LENGTH
  ) {
    return { error: SETTINGS_ERROR_MESSAGES.INSTRUCTIONS_TOO_LONG };
  }
  if (input.shippingEnabled && methods.length === 0) {
    return {
      error:
        "Add at least one payment method before offering shipping — requesters need somewhere to send the postage.",
    };
  }

  const { error } = await supabase.rpc("set_gear_request_settings", {
    p_shipping_enabled: input.shippingEnabled,
    p_payment_methods: methods,
    p_meetup_instructions: input.meetupInstructions.trim(),
    p_shipping_instructions: input.shippingInstructions.trim(),
  });

  if (error) {
    return {
      error:
        SETTINGS_ERROR_MESSAGES[error.message] ??
        "Could not save these settings. Please try again.",
    };
  }

  revalidatePath(REQUESTS_PATH);
  // The public form reads two of these through public_gear_request_settings.
  revalidatePath("/inventory/library");
  return { success: true };
}
