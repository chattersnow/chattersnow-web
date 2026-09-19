import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkPermission } from "@/lib/auth/permissions";
import { checkUser } from "@/lib/auth/current-user";
import { ensureCurrentPerson } from "@/lib/auth/current-person";
import { deliveryAddress } from "@/lib/notifications/delivery-address";
import { getOrgTimeZone } from "@/lib/org-timezone";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  tenantMailContext,
  type TenantMailContext,
} from "@/lib/email/identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Who is asking, which tenant they are asking for, and what their mail would
 * look like -- resolved once for both of this page's Server Actions (#1236).
 *
 * Neither the preview nor the test send takes a tenant, an address or a sender
 * from the client. The preview's header summary is the thing an administrator
 * finds out from that their replies go to `EMAIL_REPLY_TO` rather than to
 * them, so it has to be the identity a real send would use, resolved the same
 * way; and a test send that accepted a typed-in address would be an open relay
 * behind `system_settings:manage`. One resolver for both is what keeps the
 * header honest about where the button would actually send.
 *
 * Not a `"use server"` module: a Server Action file may export nothing but
 * async actions, and this is a helper two of them share.
 */

export type AutoReplyCaller = {
  /** The caller's own session, for reads that should obey RLS. */
  supabase: SupabaseClient;
  /** The service-role client, for the ledger and the tenant's mail settings. */
  admin: SupabaseClient;
  tenantId: string;
  personId: string;
  /** The caller's auth.users id, for `outbound_messages.sent_by`-style records. */
  userId: string;
  /**
   * Where this person's portal mail goes (#1042): their confirmed
   * `notification_email` override, or the address they sign in with. Null when
   * their directory record carries neither, which is possible for an account
   * created without one.
   */
  toEmail: string | null;
  mail: TenantMailContext;
  /** The org timezone, so a previewed event reads in the tenant's own zone. */
  timeZone: string;
};

/** Refusals both actions share, worded for an administrator. */
export const AUTO_REPLY_MAIL_ERRORS = {
  SIGNED_OUT: "You must be signed in.",
  NO_RECORD:
    "Your own directory record could not be read, so there is nothing to preview against.",
  NO_ADDRESS:
    "Your account has no email address on it, so there is nowhere to send a test.",
} as const;

/**
 * The caller, or the reason there is nothing to do for them.
 *
 * The permission is re-checked here rather than trusted from the route's
 * layout: a Server Action is a POST endpoint of its own, reachable without
 * ever rendering the page that draws the button.
 */
export async function resolveAutoReplyCaller(): Promise<
  { error: string } | { caller: AutoReplyCaller }
> {
  const supabase = await createSupabaseServerClient();
  const user = await checkUser(supabase, AUTO_REPLY_MAIL_ERRORS.SIGNED_OUT);
  if ("error" in user) return user;

  const denied = await checkPermission(supabase, "system_settings", "manage");
  if (denied) return denied;

  // ensure_current_person() rather than a plain read: an administrator who has
  // never been given a directory row of their own still has an address to send
  // a test to, and this is the RPC that mints the row from their auth metadata.
  const person = await ensureCurrentPerson(supabase);
  if (!person) return { error: AUTO_REPLY_MAIL_ERRORS.NO_RECORD };

  // The tenant comes from the caller's own row under their own session, so it
  // is whichever tenant they actually belong to and never one they named.
  const { data: row, error } = await supabase
    .from("people")
    .select("tenant_id")
    .eq("id", person.person_id)
    .maybeSingle();
  if (error || !row?.tenant_id) {
    return { error: AUTO_REPLY_MAIL_ERRORS.NO_RECORD };
  }

  const admin = createSupabaseAdminClient();
  const [mail, timeZone] = await Promise.all([
    tenantMailContext(admin, row.tenant_id as string, {
      fallbackOrigin: await getRequestOrigin(),
    }),
    getOrgTimeZone(supabase),
  ]);

  return {
    caller: {
      supabase,
      admin,
      tenantId: row.tenant_id as string,
      personId: person.person_id,
      userId: user.user.id,
      toEmail: deliveryAddress(person),
      mail,
      timeZone,
    },
  };
}
