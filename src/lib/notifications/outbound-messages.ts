import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutboundMessageStatus } from "@/lib/outbound-messages";

/**
 * Write the record that a person-triggered email went out (#1203).
 *
 * One helper rather than an insert in each sender, because both paths that
 * write this table -- a staff member's own message, and a receipt resent by
 * hand -- have to agree on what a row means. Adopting modules (#1204) call it
 * with a different `module`/`recordType` and nothing else changes.
 *
 * **It records, it does not send.** The insert happens after deliverEmail()
 * has returned, so it is deliberately outside the send: a crash between the
 * provider accepting the message and this insert loses the history row while
 * the delivery ledger keeps its own. That is the right way round. Inserting
 * first would produce rows for mail that never left, and a request's message
 * history claiming a message was sent when it was not is worse than one
 * missing a message that was.
 *
 * Its own failure is logged and swallowed for the same reason: the email is
 * already gone, and telling the staffer the send failed because a history row
 * did would invite them to send it again.
 *
 * Runs on the service-role client, which bypasses RLS -- `outbound_messages`
 * has no insert policy at all -- so tenant_id is written explicitly rather
 * than left to default_tenant_id(), which is null for a sessionless caller.
 */

export type RecordedOutboundMessage = {
  /** The id the composer minted; the primary key of the row. */
  messageId: string;
  tenantId: string;
  /** Null for a recipient with no people row of their own (#1204). */
  personId: string | null;
  toEmail: string;
  /** A has_permission() resource key: who may read this message. */
  module: string;
  recordType: string;
  recordId: string;
  subject: string;
  /** Empty for a resent receipt: the organization wrote it, not the staffer. */
  body: string;
  kind: string;
  /** What the sender claimed in notification_deliveries, to find it again. */
  dedupeKey: string;
  status: OutboundMessageStatus;
  /** The staffer's auth.users id, passed in because auth.uid() is null here. */
  sentBy: string;
};

export async function recordOutboundMessage(
  admin: SupabaseClient,
  message: RecordedOutboundMessage,
): Promise<void> {
  const { error } = await admin.from("outbound_messages").insert({
    id: message.messageId,
    tenant_id: message.tenantId,
    person_id: message.personId,
    to_email: message.toEmail,
    module: message.module,
    record_type: message.recordType,
    record_id: message.recordId,
    subject: message.subject,
    body: message.body,
    kind: message.kind,
    status: message.status,
    sent_by: message.sentBy,
    delivery_id: await findDeliveryId(admin, message),
  });

  if (error) {
    // The record the message is about reaches this through a route param, so
    // it is passed as an argument rather than interpolated into the format
    // string: a value carrying %s or a newline would otherwise garble the
    // line or forge a second one (CWE-117, CWE-134).
    console.error(
      "[outbound-message] the email went out but its history row did not",
      {
        kind: message.kind,
        recordType: message.recordType,
        recordId: message.recordId,
      },
      error,
    );
  }
}

/**
 * The delivery row the sender just claimed, found by the key it claimed it
 * with. deliverEmail() returns an outcome rather than the row, and widening
 * that return type would touch every sender in the directory for the benefit
 * of one caller -- so the key, which the caller built and therefore knows, is
 * the handle.
 *
 * Null is an acceptable answer. The column exists so an administrator can
 * cross-reference the provider's id and error text, and `status` already
 * carries what the staffer needs to see.
 */
async function findDeliveryId(
  admin: SupabaseClient,
  message: RecordedOutboundMessage,
): Promise<string | null> {
  const query = admin
    .from("notification_deliveries")
    .select("id")
    .eq("tenant_id", message.tenantId)
    .eq("kind", message.kind)
    .eq("dedupe_key", message.dedupeKey);

  const { data, error } = await (
    message.personId
      ? query.eq("person_id", message.personId)
      : query.is("person_id", null)
  ).maybeSingle();

  if (error) {
    console.error(
      "[outbound-message] could not resolve the delivery row for a sent message",
      error,
    );
    return null;
  }

  return (data?.id as string | undefined) ?? null;
}
