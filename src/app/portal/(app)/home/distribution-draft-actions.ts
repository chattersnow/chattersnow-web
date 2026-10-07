"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkAnyPermission } from "@/lib/auth/permissions";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import { sendHandoutAsIsRequest } from "@/lib/notifications/handout-as-is-request";
import { getRequestHost, getRequestOrigin } from "@/lib/request-origin";
import { mintConfirmationToken } from "@/lib/notifications/notification-email-token";
import { qrCodeDataUri } from "@/lib/inventory-label-codes";
import { gearAsIsText } from "@/lib/gear-as-is";
import { getTenantLexicon } from "@/lib/tenant-lexicon";
import type { Lexicon } from "@/lib/lexicon";
import { currentTenant, getTenantContext } from "@/lib/portal/tenants";
import { isPortalHost } from "@/lib/portal/paths";
import {
  ACKNOWLEDGEMENT_ERROR_MESSAGES,
  acknowledgementPath,
  isSkippedReason,
  toAcknowledgementView,
  type AcknowledgementView,
  type EmailLinkAvailability,
  type SkippedReason,
} from "@/lib/distribution-acknowledgement";
import {
  lookupInventoryTag,
  toReleasedTags,
  type ReleasedTag,
} from "@/lib/inventory-tags";
import {
  addToDistributionDraft,
  getDistributionDraft,
  getItemHolders,
  moveDistributionDraft,
  setDistributionDraftRecipient,
  type DistributionDraft,
  type ItemHolder,
} from "@/lib/inventory-distribution-draft";

/**
 * The scanned-distribution list behind RecordDistributionModal's scan mode
 * (#1420 part 3). Every action is gated like record_event_distribution itself,
 * and the draft tables' RLS keeps each list to its owner.
 */

const RECORD_ACCESS = [
  { resource: "inventory", level: "manage" },
  { resource: "inventory_intake", level: "manage" },
] as const;

export type ScannedItem = {
  id: string;
  description: string;
  size: string | null;
  status: string;
  intendedUse: string;
  heldBy: ItemHolder | null;
};

/**
 * The items a scan identifies: a tag URL, a bare code, a UPC or an NFC serial
 * (the lookup in src/lib/inventory-tags.ts). Several for a UPC shared by many
 * pieces; none for an unknown code, a blank label, or a code the caller may
 * not see -- the same answer for all three.
 */
export async function lookupScannedItemsAction(
  scanned: string,
): Promise<{ data: ScannedItem[] } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const { matches, error } = await lookupInventoryTag(supabase, scanned, {
    host: await getRequestHost(),
  });
  if (error) return { error: "Could not look up that scan. Please try again." };

  const ids = [
    ...new Set(matches.flatMap((match) => (match.item ? [match.item.id] : []))),
  ];
  if (ids.length === 0) return { data: [] };

  const { data, error: itemsError } = await supabase
    .from("inventory_items")
    .select("id, description, size, status, intended_use")
    .in("id", ids)
    .order("description", { ascending: true });
  if (itemsError)
    return { error: "Could not look up that scan. Please try again." };

  const holders = await getItemHolders(
    supabase,
    (data ?? []).flatMap((item) =>
      item.status === "reserved" ? [item.id] : [],
    ),
  );
  return {
    data: (data ?? []).map((item) => ({
      id: item.id,
      description: item.description,
      size: item.size,
      status: item.status,
      intendedUse: item.intended_use,
      heldBy: holders.get(item.id) ?? null,
    })),
  };
}

export async function getDistributionDraftAction(
  eventId: string | null,
): Promise<{ data: DistributionDraft | null } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const { draft, error } = await getDistributionDraft(supabase, eventId);
  if (error) return { error: "Could not load the scanned list." };
  return { data: draft };
}

export async function addToDistributionDraftAction(
  itemId: string,
  eventId: string | null,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const { error } = await addToDistributionDraft(supabase, itemId, eventId);
  if (error) return { error: "Could not add that item. Please try again." };
  return { success: true };
}

/** Stores who the list is for (#1443), so a tag tapped in another tab adds to
 *  the same person's handout and the resolver can say whose it is. */
export async function setDistributionDraftRecipientAction(
  eventId: string | null,
  personId: string | null,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const { error } = await setDistributionDraftRecipient(
    supabase,
    eventId,
    personId,
  );
  if (error)
    return { error: "Could not save the recipient. Please try again." };
  return { success: true };
}

/** Moves the list to another event (or none), merging it into any list the
 *  caller already has there. */
export async function moveDistributionDraftAction(
  fromEventId: string | null,
  toEventId: string | null,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const { error } = await moveDistributionDraft(
    supabase,
    fromEventId,
    toEventId,
  );
  if (error) return { error: "Could not change the event. Please try again." };
  return { success: true };
}

export async function removeFromDistributionDraftAction(
  itemId: string,
  eventId: string | null,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  let draftQuery = supabase.from("inventory_distribution_drafts").select("id");
  draftQuery = eventId
    ? draftQuery.eq("event_id", eventId)
    : draftQuery.is("event_id", null);
  const { data: draft, error: draftError } = await draftQuery.maybeSingle();
  if (draftError)
    return { error: "Could not remove that item. Please try again." };
  if (!draft) return { success: true };

  const { error } = await supabase
    .from("inventory_distribution_draft_items")
    .delete()
    .eq("draft_id", draft.id)
    .eq("item_id", itemId);
  if (error) return { error: "Could not remove that item. Please try again." };
  return { success: true };
}

export async function discardDistributionDraftAction(
  eventId: string | null,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  let query = supabase.from("inventory_distribution_drafts").delete();
  query = eventId ? query.eq("event_id", eventId) : query.is("event_id", null);
  const { error } = await query;
  if (error) return { error: "Could not clear the list. Please try again." };
  return { success: true };
}

/**
 * What the checkout has to ask for (#1519): whether the recipient still has to
 * acknowledge the handout as-is. Not when every piece is held for them under a
 * gear request that already carries the acknowledgement. And whether, if they
 * cannot acknowledge now, they can be emailed a link to do it afterwards.
 */
export async function getDistributionCheckoutAction(
  eventId: string | null,
): Promise<
  | { needsAcknowledgement: boolean; emailLink: EmailLinkAvailability }
  | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const { data, error } = await supabase.rpc("distribution_draft_checkout", {
    ...(eventId ? { p_event_id: eventId } : {}),
  });
  if (error)
    return { error: "Could not start the checkout. Please try again." };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    needsAcknowledgement: row?.needs_acknowledgement !== false,
    emailLink: await emailLinkAvailability(supabase),
  };
}

async function emailLinkAvailability(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<EmailLinkAvailability> {
  if (!(await publicSiteOrigin(supabase))) return "no_public_site";
  if (!(await getOrgEmailEnabled(supabase))) return "email_off";
  return "available";
}

/**
 * The origin of the tenant's public site, where the recipient's phone can open
 * the acknowledgement page: the tenant's own domain, or -- off a portal host,
 * locally and on previews -- the request's. Null when the tenant has no public
 * site (the platform tenant), where only the staff device is offered.
 */
async function publicSiteOrigin(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<string | null> {
  const tenant = currentTenant(await getTenantContext(supabase));
  if (tenant?.custom_domain && !isPortalHost(tenant.custom_domain))
    return `https://${tenant.custom_domain}`;
  if (isPortalHost(await getRequestHost())) return null;
  return (await getRequestOrigin()).replace(/\/+$/, "") || null;
}

/**
 * A fresh one-time QR code for the handout (#1519). The raw token goes only
 * into the code; the database keeps its hash. Showing the code again mints a
 * new one, which supersedes the last.
 */
export async function showAcknowledgementCodeAction(
  eventId: string | null,
): Promise<
  | { url: string; qrDataUri: string; expiresAt: string }
  | { unavailable: true }
  | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const origin = await publicSiteOrigin(supabase);
  if (!origin) return { unavailable: true };

  const { token, hash } = mintConfirmationToken();
  const { data, error } = await supabase.rpc(
    "issue_distribution_acknowledgement_token",
    { p_event_id: eventId, p_token_hash: hash },
  );
  if (error) {
    return {
      error:
        ACKNOWLEDGEMENT_ERROR_MESSAGES[error.message] ??
        "Could not show the code. Please try again.",
    };
  }
  const url = `${origin}${acknowledgementPath(token)}`;
  return { url, qrDataUri: qrCodeDataUri(url), expiresAt: String(data) };
}

/** What the recipient sees when handed the staff device: the same page as on
 *  their own phone. */
export async function getStaffDeviceAcknowledgementAction(
  eventId: string | null,
): Promise<
  { view: AcknowledgementView; lexicon: Lexicon } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const [{ data, error }, lexicon] = await Promise.all([
    supabase.rpc("get_distribution_acknowledgement_on_staff_device", {
      ...(eventId ? { p_event_id: eventId } : {}),
    }),
    getTenantLexicon(supabase),
  ]);
  if (error) {
    return {
      error:
        ACKNOWLEDGEMENT_ERROR_MESSAGES[error.message] ??
        "Could not open the acknowledgement. Please try again.",
    };
  }
  return { view: toAcknowledgementView(data), lexicon };
}

/**
 * The recipient acknowledging on the staff device (#1519), recorded as such.
 * The words are this tenant's, resolved here -- never sent by the browser.
 */
export async function acknowledgeOnStaffDeviceAction(
  eventId: string | null,
  input: { typedName: string; acknowledged: boolean },
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  const lexicon = await getTenantLexicon(supabase);
  const { error } = await supabase.rpc(
    "acknowledge_distribution_on_staff_device",
    {
      p_event_id: eventId,
      p_acknowledged: input.acknowledged,
      p_typed_name: input.typedName,
      p_as_is_text: gearAsIsText(lexicon),
    },
  );
  if (error) {
    return {
      error:
        ACKNOWLEDGEMENT_ERROR_MESSAGES[error.message] ??
        "Could not save the acknowledgement. Please try again.",
    };
  }
  return { success: true };
}

export type RecordDraftInput = {
  eventId: string | null;
  occurredAt?: string;
  reason?: string;
  recipientPersonId?: string;
  markDistributed: boolean;
  /** The numbered codes ticked off as removed (#1519). */
  removedTags?: string[];
  /** Why the recipient did not acknowledge, when they did not. */
  skippedReason?: SkippedReason;
  skippedNote?: string;
  /** With a reason: email the recipient a link to acknowledge afterwards. */
  emailLink?: boolean;
};

/** What became of the emailed link, when one was asked for. */
export type EmailLinkOutcome = "sent" | "not_sent";

/**
 * Records every scanned piece as its own distribution, in one transaction
 * (record_distribution_draft()), and clears the list. If one was given out by
 * someone else since it was scanned, nothing is recorded and `itemId` names it.
 * `releasedTags` are the numbered codes the handout freed (#1444).
 */
export async function recordDistributionDraftAction(
  input: RecordDraftInput,
): Promise<
  | {
      count: number;
      releasedTags: ReleasedTag[];
      emailLink: EmailLinkOutcome | null;
    }
  | { error: string; itemId?: string }
> {
  const supabase = await createSupabaseServerClient();
  const permissionError = await checkAnyPermission(supabase, [
    ...RECORD_ACCESS,
  ]);
  if (permissionError) return permissionError;

  // The link is minted before the record so the database can write it in the
  // same transaction; the raw token stays here and goes only into the email.
  const wantsLink =
    Boolean(input.emailLink) && isSkippedReason(input.skippedReason);
  const link = wantsLink ? mintConfirmationToken() : null;

  const { data, error } = await supabase.rpc("record_distribution_draft", {
    ...(input.eventId ? { p_event_id: input.eventId } : {}),
    p_occurred_at: input.occurredAt
      ? new Date(input.occurredAt).toISOString()
      : new Date().toISOString(),
    ...(input.reason?.trim() ? { p_reason: input.reason.trim() } : {}),
    ...(input.recipientPersonId
      ? { p_recipient_person_id: input.recipientPersonId }
      : {}),
    p_mark_item_distributed: input.markDistributed,
    p_removed_tags: input.removedTags ?? [],
    ...(isSkippedReason(input.skippedReason)
      ? { p_skipped_reason: input.skippedReason }
      : {}),
    ...(input.skippedNote?.trim()
      ? { p_skipped_note: input.skippedNote.trim() }
      : {}),
    ...(link ? { p_link_token_hash: link.hash } : {}),
  });

  if (error) {
    if (error.message === "DRAFT_EMPTY") {
      return { error: "Scan at least one item first." };
    }
    if (error.message === "TAGS_NOT_REMOVED") {
      return {
        error: error.details
          ? `Take tag ${error.details} off first, and tick it.`
          : "Take every numbered tag off first, and tick it.",
      };
    }
    if (error.message === "ACKNOWLEDGEMENT_REQUIRED") {
      return {
        error:
          "The recipient hasn't acknowledged the handout. Wait for them, or give a reason for recording without it.",
      };
    }
    if (error.message === "SKIP_REASON_INVALID") {
      return { error: "Say why the recipient didn't acknowledge it." };
    }
    if (error.message === "ITEM_ALREADY_DISTRIBUTED") {
      return {
        error:
          "One of these items has already been distributed. Remove it and record the rest.",
        itemId: error.details || undefined,
      };
    }
    return { error: "Could not record the distribution. Please try again." };
  }

  revalidatePath("/portal/home");
  revalidatePath("/portal/inventory/items");
  revalidatePath("/portal/inventory/distribution");
  revalidatePath("/portal/events");
  // Each numbered code the handout freed (#1444), so the modal can say which
  // tags to take off the gear.
  const row = Array.isArray(data) ? data[0] : data;
  return {
    count: row?.recorded ?? 0,
    releasedTags: toReleasedTags(row?.released_tags),
    emailLink: link
      ? row?.link_expires_at
        ? await emailHandoutLink(supabase, link)
        : "not_sent"
      : null,
  };
}

/**
 * Mails the link record_distribution_draft() just wrote (#1519). The handout
 * is recorded either way; a send that does not go out withdraws the link, and
 * the caller only says so.
 */
async function emailHandoutLink(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  link: { token: string; hash: string },
): Promise<EmailLinkOutcome> {
  const admin = createSupabaseAdminClient();
  const withdraw = () =>
    admin
      .from("distribution_acknowledgement_requests")
      .delete()
      .eq("token_hash", link.hash);

  const { data: request } = await admin
    .from("distribution_acknowledgement_requests")
    .select("tenant_id, acknowledgement_id")
    .eq("token_hash", link.hash)
    .maybeSingle();
  const [{ data: acknowledgement }, { data: movement }, { data: auth }] =
    await Promise.all([
      admin
        .from("distribution_acknowledgements")
        .select(
          "recipient:people!distribution_acknowledgements_recipient_in_tenant(id, name, preferred_name, email)",
        )
        .eq("id", request?.acknowledgement_id ?? "")
        .maybeSingle(),
      admin
        .from("inventory_movements")
        .select("event:events(name)")
        .eq(
          "distribution_acknowledgement_id",
          request?.acknowledgement_id ?? "",
        )
        .not("event_id", "is", null)
        .limit(1)
        .maybeSingle(),
      supabase.auth.getUser(),
    ]);
  const recipient = acknowledgement?.recipient;
  const email = recipient?.email?.trim();
  if (!request || !recipient || !email || !auth.user) {
    await withdraw();
    return "not_sent";
  }

  const outcome = await sendHandoutAsIsRequest(admin, {
    tenantId: request.tenant_id,
    acknowledgementId: request.acknowledgement_id,
    recipient: {
      personId: recipient.id,
      name: (recipient.preferred_name?.trim() || recipient.name || "").trim(),
      email,
    },
    eventName: movement?.event?.name ?? null,
    token: link.token,
    tokenHash: link.hash,
    sentBy: auth.user.id,
    fallbackOrigin: await getRequestOrigin(),
  });
  return outcome === "sent" ? "sent" : "not_sent";
}
