"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import {
  MAX_DELIVERY_INSTRUCTIONS_LENGTH,
  MAX_PASSPHRASE_HELP_TEXT_LENGTH,
  MAX_PASSPHRASE_LENGTH,
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
import { sendStaffMessage } from "@/lib/notifications/staff-message";
import {
  explainSkippedSend,
  RECORD_MESSAGE_ERRORS,
  validateRecordMessage,
} from "@/lib/notifications/record-message";
import { recordOutboundMessage } from "@/lib/notifications/outbound-messages";
import {
  gearRequestConfirmationDedupeKey,
  sendGearRequestConfirmation,
} from "@/lib/notifications/submission-notifications";
import { GEAR_REQUEST_CONFIRMATION_KIND } from "@/lib/notifications/kinds";
import {
  GEAR_REQUEST_RECORD_TYPE,
  resendDedupeSuffix,
} from "@/lib/outbound-messages";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  sendGearAsIsRequests,
  type AsIsRequestRecipientWithToken,
} from "@/lib/notifications/gear-as-is-request";
import {
  AS_IS_REQUEST_ERRORS,
  needsAsIsAcknowledgement,
  oneAsIsRequest,
  resolveAsIsRequests,
  type AsIsRequestCandidate,
  type AsIsRequestRecipient,
  type AsIsRequestStatus,
} from "@/lib/gear-request-as-is-requests";

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

const EDIT_ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "You don't have permission to update requests.",
  REQUEST_NOT_FOUND: "This request could not be found.",
  REQUEST_CLOSED: "This request is already fulfilled or cancelled.",
  ITEM_NOT_FOUND: "That item could not be found in the gear library.",
  ITEM_NOT_AVAILABLE: "That item is no longer available.",
  ITEM_NOT_HELD: "This request is not holding that item.",
  LAST_ITEM:
    "This is the last item on the request. Cancel the request instead.",
};

/** Signed in and holding inventory:manage, or the sentence saying why not. */
async function checkCanEditRequest(
  supabase: SupabaseClient,
): Promise<{ error: string } | null> {
  const userResult = await checkUser(
    supabase,
    "You must be signed in to update requests.",
  );
  if ("error" in userResult) return userResult;
  return checkPermission(supabase, "inventory", "manage");
}

/**
 * The three staff edits to an open request (#1527). Each RPC re-checks
 * inventory:manage and refuses a closed request; the checks here only turn
 * a refusal into a sentence.
 */
async function editGearRequest(
  requestId: string,
  rpc: (supabase: SupabaseClient) => PromiseLike<{
    error: { message: string } | null;
  }>,
  itemsMoved: boolean,
): Promise<GearRequestActionResult> {
  const supabase = await createSupabaseServerClient();
  const denied = await checkCanEditRequest(supabase);
  if (denied) return denied;

  const { error } = await rpc(supabase);
  if (error) {
    return {
      error:
        EDIT_ERROR_MESSAGES[error.message] ??
        "Could not update this request. Please try again.",
    };
  }

  revalidatePath(REQUESTS_PATH);
  revalidatePath(`${REQUESTS_PATH}/${requestId}`);
  // An item taken off or put on a request leaves or joins the catalogue.
  if (itemsMoved) {
    revalidatePath("/portal/inventory/items");
    revalidatePath("/inventory/library");
  }
  return { success: true };
}

export async function addGearRequestItemAction(
  requestId: string,
  itemId: string,
): Promise<GearRequestActionResult> {
  return editGearRequest(
    requestId,
    (supabase) =>
      supabase.rpc("add_gear_request_item", {
        p_request_id: requestId,
        p_inventory_item_id: itemId,
      }),
    true,
  );
}

export async function removeGearRequestItemAction(
  requestId: string,
  itemId: string,
): Promise<GearRequestActionResult> {
  return editGearRequest(
    requestId,
    (supabase) =>
      supabase.rpc("remove_gear_request_item", {
        p_request_id: requestId,
        p_inventory_item_id: itemId,
      }),
    true,
  );
}

export async function setGearRequestNotesAction(
  requestId: string,
  notes: string,
): Promise<GearRequestActionResult> {
  return editGearRequest(
    requestId,
    (supabase) =>
      supabase.rpc("set_gear_request_notes", {
        p_request_id: requestId,
        p_notes: notes,
      }),
    false,
  );
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

export type GearRequestPassphraseInput = {
  passphraseRequired: boolean;
  passphrase: string;
  passphraseHelpText: string;
};

const PASSPHRASE_ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: SETTINGS_ERROR_MESSAGES.PERMISSION_DENIED,
  PASSPHRASE_MISSING: "Enter a passphrase before turning this on.",
  PASSPHRASE_TOO_LONG: `The passphrase must be ${MAX_PASSPHRASE_LENGTH} characters or fewer.`,
  PASSPHRASE_HELP_TOO_LONG: `The help text must be ${MAX_PASSPHRASE_HELP_TEXT_LENGTH} characters or fewer.`,
};

/**
 * The public cart's passphrase (#1536), written through
 * set_gear_request_passphrase() on the same inventory:manage gate. Its own
 * write, so saving the delivery settings can never clear it.
 */
export async function updateGearRequestPassphraseAction(
  input: GearRequestPassphraseInput,
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

  const passphrase = input.passphrase.trim();
  const helpText = input.passphraseHelpText.trim();
  if (input.passphraseRequired && !passphrase) {
    return { error: PASSPHRASE_ERROR_MESSAGES.PASSPHRASE_MISSING };
  }
  if (passphrase.length > MAX_PASSPHRASE_LENGTH) {
    return { error: PASSPHRASE_ERROR_MESSAGES.PASSPHRASE_TOO_LONG };
  }
  if (helpText.length > MAX_PASSPHRASE_HELP_TEXT_LENGTH) {
    return { error: PASSPHRASE_ERROR_MESSAGES.PASSPHRASE_HELP_TOO_LONG };
  }

  const { error } = await supabase.rpc("set_gear_request_passphrase", {
    p_required: input.passphraseRequired,
    p_passphrase: passphrase,
    p_help_text: helpText,
  });

  if (error) {
    return {
      error:
        PASSPHRASE_ERROR_MESSAGES[error.message] ??
        "Could not save the passphrase. Please try again.",
    };
  }

  revalidatePath(REQUESTS_PATH);
  revalidatePath("/inventory/library");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Messaging the requester (#1203)
// ---------------------------------------------------------------------------

// What names this record, said this queue's way. Everything else a composer
// can answer -- an empty subject, a spent message id, the org switch being off
// -- is shared with the other queues (#1204) in @/lib/notifications/record-message.
const MESSAGE_ERRORS = {
  SIGNED_OUT: "You must be signed in to message a requester.",
  NOT_FOUND: "This request could not be found.",
  NO_EMAIL:
    "This request has no email address to write to — the requester's record was cleared or never carried one.",
  FAILED: RECORD_MESSAGE_ERRORS.FAILED,
} as const;

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

  const validated = validateRecordMessage(input);
  if ("error" in validated) return validated;
  const { subject, body } = validated;

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

  // Two ways to get here and they are not the same news: the organization's
  // switch is off, or this message id has already been spent.
  if (outcome === "skipped") {
    return { error: await explainSkippedSend(supabase) };
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
    return {
      error: await explainSkippedSend(
        supabase,
        "The confirmation has already been resent in the last minute.",
      ),
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

// ---------------------------------------------------------------------------
// Asking for the as-is acknowledgement by emailed link (#1518)
// ---------------------------------------------------------------------------

/** What both asks read about a request; `as_is_request` is its link, if any. */
const AS_IS_CANDIDATE_SELECT =
  "id, status, person_id, as_is_acknowledged_at, requester:people(name, preferred_name, email), as_is_request:gear_request_acknowledgement_requests(requested_at, acknowledged_at)";

type AsIsCandidateRow = Omit<AsIsRequestCandidate, "as_is_request"> & {
  tenant_id: string;
  as_is_request: AsIsRequestStatus | AsIsRequestStatus[] | null;
};

function toAsIsCandidate(row: AsIsCandidateRow): AsIsRequestCandidate {
  return { ...row, as_is_request: oneAsIsRequest(row.as_is_request) };
}

async function requireInventoryManage() {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(supabase, MESSAGE_ERRORS.SIGNED_OUT);
  if ("error" in userResult) return userResult;
  const permissionError = await checkPermission(
    supabase,
    "inventory",
    "manage",
  );
  if (permissionError) return permissionError;
  return { supabase, user: userResult.user };
}

/**
 * Mints a token per recipient and stores only the hashes. Returns the
 * recipients whose links were written, raw token beside each; a request the
 * RPC skipped (cancelled or acknowledged since it was read) is dropped, so it
 * is never mailed a link that does not work.
 */
async function writeAsIsRequests(
  supabase: SupabaseClient,
  recipients: readonly AsIsRequestRecipient[],
): Promise<
  { recipients: AsIsRequestRecipientWithToken[] } | { error: string }
> {
  const minted = recipients.map((recipient) => {
    const { token, hash } = mintConfirmationToken();
    return { ...recipient, token, tokenHash: hash };
  });
  const { data, error } = await supabase.rpc(
    "request_gear_request_acknowledgements",
    {
      p_requests: minted.map((recipient) => ({
        request_id: recipient.requestId,
        token_hash: recipient.tokenHash,
      })),
    },
  );
  if (error) return { error: AS_IS_REQUEST_ERRORS.FAILED };
  const written = new Set(
    ((data ?? []) as { request_id: string }[]).map((row) => row.request_id),
  );
  const kept = minted.filter((recipient) => written.has(recipient.requestId));
  if (kept.length === 0) return { error: AS_IS_REQUEST_ERRORS.NO_RECIPIENTS };
  return { recipients: kept };
}

/**
 * Ask this request's requester to acknowledge as-is (#1518), from the request
 * detail. Sent while the staffer waits, so a failure is reported here.
 */
export async function askToAcknowledgeAsIsAction(
  requestId: string,
): Promise<GearRequestActionResult> {
  const guard = await requireInventoryManage();
  if ("error" in guard) return guard;

  const { data, error } = await guard.supabase
    .from("gear_requests")
    .select(`tenant_id, ${AS_IS_CANDIDATE_SELECT}`)
    .eq("id", requestId)
    .maybeSingle<AsIsCandidateRow>();
  if (error) return { error: AS_IS_REQUEST_ERRORS.FAILED };
  if (!data) return { error: AS_IS_REQUEST_ERRORS.NOT_FOUND };
  if (data.status === "cancelled") {
    return { error: AS_IS_REQUEST_ERRORS.CANCELLED };
  }
  if (!needsAsIsAcknowledgement(data)) {
    return { error: AS_IS_REQUEST_ERRORS.ALREADY_ACKNOWLEDGED };
  }
  const resolved = resolveAsIsRequests([toAsIsCandidate(data)], {
    includeRecent: true,
  });
  if (resolved.recipients.length === 0) {
    return { error: AS_IS_REQUEST_ERRORS.NO_EMAIL };
  }
  if (!(await getOrgEmailEnabled(guard.supabase))) {
    return { error: RECORD_MESSAGE_ERRORS.EMAIL_OFF };
  }

  const written = await writeAsIsRequests(guard.supabase, resolved.recipients);
  if ("error" in written) return written;

  const summary = await sendGearAsIsRequests(createSupabaseAdminClient(), {
    tenantId: data.tenant_id,
    batchId: crypto.randomUUID(),
    recipients: written.recipients,
    sentBy: guard.user.id,
    fallbackOrigin: await getRequestOrigin(),
  });
  if (summary.failed > 0) return { error: AS_IS_REQUEST_ERRORS.FAILED };
  if (summary.sent === 0) {
    return { error: await explainSkippedSend(guard.supabase) };
  }

  revalidatePath(REQUESTS_PATH);
  revalidatePath(`${REQUESTS_PATH}/${requestId}`);
  return { success: true };
}

export type AskAllToAcknowledgeAsIsResult =
  { error: string } | { success: true; recipients: number };

/**
 * Ask every request still missing its acknowledgement (#1518), from the
 * Requests list. The audience is resolved here under the caller's session
 * from the same pure function the dialog counted with; only the sending is
 * deferred, as #1502's bulk send is.
 */
export async function askAllToAcknowledgeAsIsAction(input: {
  batchId: string;
  includeRecent: boolean;
}): Promise<AskAllToAcknowledgeAsIsResult> {
  const guard = await requireInventoryManage();
  if ("error" in guard) return guard;

  const { data, error } = await guard.supabase
    .from("gear_requests")
    .select(`tenant_id, ${AS_IS_CANDIDATE_SELECT}`)
    .is("as_is_acknowledged_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });
  if (error) return { error: AS_IS_REQUEST_ERRORS.FAILED };

  const rows = (data ?? []) as unknown as AsIsCandidateRow[];
  const resolved = resolveAsIsRequests(rows.map(toAsIsCandidate), {
    includeRecent: input.includeRecent,
  });
  if (resolved.recipients.length === 0) {
    return { error: AS_IS_REQUEST_ERRORS.NO_RECIPIENTS };
  }
  if (!(await getOrgEmailEnabled(guard.supabase))) {
    return { error: RECORD_MESSAGE_ERRORS.EMAIL_OFF };
  }

  const written = await writeAsIsRequests(guard.supabase, resolved.recipients);
  if ("error" in written) return written;

  const batch = {
    tenantId: rows[0].tenant_id,
    batchId: input.batchId,
    recipients: written.recipients,
    sentBy: guard.user.id,
    // Read before after(): the request is gone by the time it runs.
    fallbackOrigin: await getRequestOrigin(),
  };
  const admin = createSupabaseAdminClient();
  after(async () => {
    try {
      await sendGearAsIsRequests(admin, batch);
    } catch (error) {
      console.error("[gear-as-is-request] the batch threw", error);
    }
  });

  revalidatePath(REQUESTS_PATH);
  return { success: true, recipients: written.recipients.length };
}
