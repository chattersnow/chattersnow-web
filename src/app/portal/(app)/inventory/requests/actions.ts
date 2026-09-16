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
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestOrigin } from "@/lib/request-origin";
import { personDisplayName } from "@/lib/format";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import { sendStaffMessage } from "@/lib/notifications/staff-message";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import {
  gearRequestConfirmationDedupeKey,
  sendGearRequestConfirmation,
} from "@/lib/notifications/submission-notifications";
import { GEAR_REQUEST_CONFIRMATION_KIND } from "@/lib/notifications/kinds";
import {
  GEAR_REQUEST_RECORD_TYPE,
  MAX_MESSAGE_BODY_LENGTH,
  MAX_MESSAGE_SUBJECT_LENGTH,
  resendDedupeSuffix,
} from "@/lib/outbound-messages";

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

// ---------------------------------------------------------------------------
// Messaging the requester (#1203)
// ---------------------------------------------------------------------------

const MESSAGE_ERRORS = {
  SIGNED_OUT: "You must be signed in to message a requester.",
  NOT_FOUND: "This request could not be found.",
  NO_EMAIL:
    "This request has no email address to write to — the requester's record was cleared or never carried one.",
  SUBJECT_REQUIRED: "Write a subject.",
  BODY_REQUIRED: "Write a message.",
  SUBJECT_TOO_LONG: `Keep the subject to ${MAX_MESSAGE_SUBJECT_LENGTH} characters or fewer.`,
  BODY_TOO_LONG: `Keep the message to ${MAX_MESSAGE_BODY_LENGTH} characters or fewer.`,
  MESSAGE_ID_INVALID: "Reopen the message and try again.",
  ALREADY_SENT:
    "That message has already gone out. Reopen the composer to send another.",
  EMAIL_OFF:
    "Outbound email is switched off for this organization, so nothing was sent.",
  FAILED: "The message could not be sent. Please try again.",
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RequesterRow = {
  tenant_id: string;
  person_id: string | null;
  requester: {
    name: string | null;
    preferred_name: string | null;
    email: string | null;
  } | null;
};

const REQUESTER_SELECT =
  "tenant_id, person_id, requester:people(name, preferred_name, email)";

/**
 * Write to the person who made this request.
 *
 * The recipient is resolved here from the request, never taken from the
 * client. Accepting an address as an argument would make this action a relay
 * that sends anything to anyone behind `inventory:manage`, which is a much
 * larger thing than the button that calls it.
 *
 * The send is awaited rather than deferred with `after()` the way the
 * event-triggered sends are: a staffer is standing in front of the dialog and
 * has to be told whether their message went.
 */
export async function sendGearRequestMessageAction(input: {
  messageId: string;
  requestId: string;
  subject: string;
  body: string;
}): Promise<GearRequestActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, MESSAGE_ERRORS.SIGNED_OUT);
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "inventory",
    "manage",
  );
  if (permissionError) return permissionError;

  if (!UUID_PATTERN.test(input.messageId)) {
    return { error: MESSAGE_ERRORS.MESSAGE_ID_INVALID };
  }
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject) return { error: MESSAGE_ERRORS.SUBJECT_REQUIRED };
  if (!body) return { error: MESSAGE_ERRORS.BODY_REQUIRED };
  if (subject.length > MAX_MESSAGE_SUBJECT_LENGTH) {
    return { error: MESSAGE_ERRORS.SUBJECT_TOO_LONG };
  }
  if (body.length > MAX_MESSAGE_BODY_LENGTH) {
    return { error: MESSAGE_ERRORS.BODY_TOO_LONG };
  }

  // Read under the caller's own session, so a request in another tenant is
  // not found rather than being mailed.
  const { data, error } = await supabase
    .from("gear_requests")
    .select(REQUESTER_SELECT)
    .eq("id", input.requestId)
    .maybeSingle<RequesterRow>();

  if (error) return { error: MESSAGE_ERRORS.FAILED };
  if (!data) return { error: MESSAGE_ERRORS.NOT_FOUND };
  const toEmail = data.requester?.email?.trim();
  // Both branches of the same sentence: a request whose requester the
  // retention purge cleared has no person_id, and one taken through the
  // honeypot has no address.
  if (!toEmail) return { error: MESSAGE_ERRORS.NO_EMAIL };

  const outcome = await sendStaffMessage(createSupabaseAdminClient(), {
    messageId: input.messageId,
    tenantId: data.tenant_id,
    personId: data.person_id,
    toEmail,
    recipientName: personDisplayName(data.requester, ""),
    module: "inventory",
    recordType: GEAR_REQUEST_RECORD_TYPE,
    recordId: input.requestId,
    subject,
    body,
    sentBy: userResult.user.id,
    fallbackOrigin: await getRequestOrigin(),
  });

  if (outcome === "skipped") {
    // Two ways to get here and they are not the same news: the organization's
    // switch is off, or this message id has already been spent.
    const enabled = await getOrgEmailEnabled(supabase);
    return {
      error: enabled ? MESSAGE_ERRORS.ALREADY_SENT : MESSAGE_ERRORS.EMAIL_OFF,
    };
  }
  if (outcome === "failed") return { error: MESSAGE_ERRORS.FAILED };

  revalidatePath(`${REQUESTS_PATH}/${input.requestId}`);
  return { success: true };
}

/**
 * Send the confirmation again.
 *
 * For the requests taken before the confirmation existed (#1032), and for the
 * ones where it went to a mailbox the requester no longer reads. It re-renders
 * through the original sender rather than a copy, so a resent receipt says
 * exactly what a fresh one would -- including the tenant's current meetup or
 * shipping instructions, which is the point of reading them at send time.
 */
export async function resendGearRequestConfirmationAction(
  requestId: string,
): Promise<GearRequestActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, MESSAGE_ERRORS.SIGNED_OUT);
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "inventory",
    "manage",
  );
  if (permissionError) return permissionError;

  const { data, error } = await supabase
    .from("gear_requests")
    .select(REQUESTER_SELECT)
    .eq("id", requestId)
    .maybeSingle<RequesterRow>();

  if (error) return { error: MESSAGE_ERRORS.FAILED };
  if (!data) return { error: MESSAGE_ERRORS.NOT_FOUND };
  // sendGearRequestConfirmation() answers `skipped` for both of these, which
  // would read to the staffer as "already sent". Say what is actually wrong.
  if (!data.person_id || !data.requester?.email?.trim()) {
    return { error: MESSAGE_ERRORS.NO_EMAIL };
  }

  const admin = createSupabaseAdminClient();
  const dedupeSuffix = resendDedupeSuffix();
  // An object rather than a `let`: TypeScript narrows a variable a callback
  // assigns to its initial type, and this one is only ever read afterwards.
  const sent: { subject?: string } = {};

  const outcome = await sendGearRequestConfirmation(admin, {
    requestId,
    siteUrl: await getRequestOrigin(),
    dedupeSuffix,
    onRendered: (email) => {
      sent.subject = email.subject;
    },
  });

  if (outcome === "skipped") {
    const enabled = await getOrgEmailEnabled(supabase);
    return {
      error: enabled
        ? "The confirmation has already been resent in the last minute."
        : MESSAGE_ERRORS.EMAIL_OFF,
    };
  }
  if (outcome === "failed") {
    return { error: "The confirmation could not be resent. Please try again." };
  }

  // The resend joins the history like any other send, so the card explains a
  // second copy the requester may ask about. The body is empty on purpose:
  // the organization wrote this one, and the renderer is where it lives.
  await recordOutboundMessage(admin, {
    messageId: crypto.randomUUID(),
    tenantId: data.tenant_id,
    personId: data.person_id,
    toEmail: data.requester.email!.trim(),
    module: "inventory",
    recordType: GEAR_REQUEST_RECORD_TYPE,
    recordId: requestId,
    subject: sent.subject ?? "Your gear request",
    body: "",
    kind: GEAR_REQUEST_CONFIRMATION_KIND,
    dedupeKey: gearRequestConfirmationDedupeKey(requestId, dedupeSuffix),
    status: outcome,
    sentBy: userResult.user.id,
  });

  revalidatePath(`${REQUESTS_PATH}/${requestId}`);
  return { success: true };
}
