import type { SupabaseClient } from "@supabase/supabase-js";
import {
  autoReplyDefaults,
  autoReplyDefinition,
  emptyAutoReplyCopy,
  mergeAutoReplySlots,
  type AutoReplyCopy,
} from "@/lib/notifications/auto-replies";

/**
 * What one tenant's automatic reply says, and whether it goes at all (#1233).
 *
 * Separate from the registry because this one needs a Supabase client, and
 * src/lib/notifications/auto-replies.ts must stay importable from a client
 * component.
 */

export type ResolvedAutoReply = {
  /**
   * False only when the tenant switched this one receipt off. It is not the
   * org-wide kill switch (isOrgEmailEnabled) and not the person's own opt-out;
   * a sender checks all three, in that order.
   */
  enabled: boolean;
  /** Every slot present, tokens not yet substituted. */
  slots: AutoReplyCopy;
};

/**
 * The tenant's row for one reply kind, folded over the platform's defaults.
 *
 * Runs on the service-role client in the send path, which bypasses RLS, so
 * the tenant is passed explicitly rather than left to current_tenant_id() --
 * that resolves to null for a sessionless caller. Called once per tenant per
 * send, beside the existing isOrgEmailEnabled() / tenantMailContext() lookups
 * in the same loop, not once per recipient.
 *
 * **Falls back to the defaults on a read error, and says so in the log.**
 * That is the opposite of isOrgEmailEnabled(), which fails closed, and the
 * difference is deliberate: the kill switch decides *whether* mail goes out,
 * while this decides *what it says*. A receipt that never arrives loses the
 * reference code; a receipt that arrives in platform English is merely
 * impersonal.
 */
export async function resolveAutoReply(
  client: SupabaseClient,
  tenantId: string,
  kind: string,
): Promise<ResolvedAutoReply> {
  const definition = autoReplyDefinition(kind);

  // Only reachable from a typo in platform code: every caller passes a
  // registry key. There is no wording to fall back to, so this says so
  // loudly rather than inventing one.
  if (!definition) {
    console.error(
      `[notifications] no auto-reply is registered under "${kind}"; there is no copy to send`,
    );
    return { enabled: true, slots: emptyAutoReplyCopy() };
  }

  const { data, error } = await client
    .from("auto_reply_templates")
    .select("enabled, slots")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .maybeSingle();

  if (error) {
    console.error(
      `[notifications] could not read the "${kind}" auto-reply for tenant ${tenantId}; sending the platform's wording`,
      error,
    );
    return { enabled: true, slots: autoReplyDefaults(definition) };
  }

  // No row is the ordinary case, and the one that keeps a tenant on our
  // defaults: a tenant who has never opened the editor has none.
  if (!data) return { enabled: true, slots: autoReplyDefaults(definition) };

  return {
    // Anything that is not an explicit boolean -- a null, a value typed by
    // hand into the table -- reads as on, the way an absent row does.
    enabled: typeof data.enabled === "boolean" ? data.enabled : true,
    slots: mergeAutoReplySlots(definition, data.slots),
  };
}
