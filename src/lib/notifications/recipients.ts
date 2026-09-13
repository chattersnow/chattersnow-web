import type { SupabaseClient } from "@supabase/supabase-js";
import { NOTIFICATION_KINDS } from "@/lib/notifications/kinds";
import { personDisplayName } from "@/lib/format";

/**
 * Who receives each kind of email, for the administrator-facing card on
 * Organization Settings -> Notifications (#1044).
 *
 * The two halves a send actually intersects -- holds the role, and opted in --
 * come back separately on purpose: the useful thing to show is who is *missing*
 * from one of them, which is silent everywhere else.
 */
export type NotificationRecipient = {
  personId: string;
  name: string;
  /**
   * Where their mail is delivered -- `coalesce(notification_email, email)`, the
   * same rule `deliveryAddress()` applies (#1059). Not the sign-in address,
   * which is an identity key first and a mailbox second.
   */
  email: string;
  /** They turned this kind on for themselves, on /portal/account. */
  optedIn: boolean;
  /** Their portal roles reach the level the sender requires. */
  holdsRole: boolean;
  /** Both, which is what the sender checks. */
  receives: boolean;
};

/** Keyed by kind. A kind nobody is attached to at all is simply absent. */
export type NotificationRecipientsByKind = Record<
  string,
  NotificationRecipient[]
>;

type RecipientRow = {
  kind: string;
  person_id: string;
  name: string | null;
  preferred_name: string | null;
  email: string | null;
  opted_in: boolean;
  holds_role: boolean;
  receives: boolean;
};

/**
 * The kind/resource/level mapping the RPC needs, straight off the registry, so
 * that adding a kind stays a change to kinds.ts alone. A kind with no
 * `requires` is sent with no resources, which the RPC reads as "no role
 * requirement" -- everyone who opted in receives it.
 */
function kindRequirements() {
  return NOTIFICATION_KINDS.map(({ key, requires }) => ({
    kind: key,
    resources: requires?.resources ?? null,
    level: requires?.level ?? null,
  }));
}

/** Null means the read failed -- distinct from "nobody receives anything". */
export async function getNotificationRecipients(
  supabase: SupabaseClient,
): Promise<NotificationRecipientsByKind | null> {
  const { data, error } = await supabase.rpc("notification_recipients", {
    p_kinds: kindRequirements(),
  });

  if (error) {
    // A reader, not a gate: an administrator who cannot read this still gets
    // the rest of the panel, and the card says so rather than claiming nobody
    // receives anything.
    console.error("[notifications] could not resolve who receives what", error);
    return null;
  }

  const byKind: NotificationRecipientsByKind = {};
  for (const row of (data ?? []) as RecipientRow[]) {
    (byKind[row.kind] ??= []).push({
      personId: row.person_id,
      name: personDisplayName(row, row.email ?? "Someone"),
      email: row.email ?? "",
      optedIn: row.opted_in,
      holdsRole: row.holds_role,
      receives: row.receives,
    });
  }
  return byKind;
}
