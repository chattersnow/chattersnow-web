import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CONSTITUENT_NOTIFICATION_KINDS,
  NOTIFICATION_KINDS,
} from "@/lib/notifications/kinds";
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

/**
 * How each receipt to the public actually goes out (#1484).
 *
 * The recipient read above cannot answer this. A receipt is opt-*out*
 * (`defaultEnabled`), so it goes to whoever fills in the form, and most of
 * them have no preference row at all; `notification_recipients()` only
 * returns the `enabled` rows, so the card used to say "Nobody receives this"
 * about receipts that go to every submitter. What an administrator can
 * usefully see is the other side: how many people turned it off, and whether
 * the organization switched the reply off in Automatic Replies.
 */
export type ReceiptDelivery = {
  /** People with an explicit `enabled = false` row for this kind. */
  optedOut: number;
  /** The reply is switched off under Administration -> Automatic Replies. */
  switchedOff: boolean;
};

/** Keyed by kind; null means either read failed. */
export async function getReceiptDelivery(
  supabase: SupabaseClient,
): Promise<Record<string, ReceiptDelivery> | null> {
  const kinds = CONSTITUENT_NOTIFICATION_KINDS.map((kind) => kind.key);
  const [optOuts, replies] = await Promise.all([
    supabase
      .from("person_notification_preferences")
      .select("kind")
      .in("kind", kinds)
      .eq("enabled", false),
    supabase
      .from("auto_reply_templates")
      .select("kind")
      .in("kind", kinds)
      .eq("enabled", false),
  ]);

  if (optOuts.error || replies.error) {
    console.error(
      "[notifications] could not resolve how receipts are delivered",
      optOuts.error ?? replies.error,
    );
    return null;
  }

  const switchedOff = new Set(replies.data.map((row) => row.kind as string));
  const delivery: Record<string, ReceiptDelivery> = {};
  for (const kind of kinds) {
    delivery[kind] = { optedOut: 0, switchedOff: switchedOff.has(kind) };
  }
  for (const row of optOuts.data) {
    delivery[row.kind as string].optedOut += 1;
  }
  return delivery;
}
