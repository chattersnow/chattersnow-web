import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send";
import type { RenderedEmail } from "@/lib/notifications/rendered-email";

/**
 * Claim the send, then send it (#488, extracted for #742).
 *
 * The insert comes first so that two invocations racing -- a retried Server
 * Action, or the same cron firing from two Vercel projects that share
 * vercel.json -- resolve on notification_deliveries' unique constraint rather
 * than on a "have we sent yet?" read that both would answer "no". The loser
 * gets 23505 and stops. The winner owns the row and finishes it with whatever
 * the provider said.
 *
 * This lives in one file rather than once per sender because the two branches
 * that matter -- 23505 means skip, and a failed finalize must not be reported
 * as a failed send -- are the whole correctness argument for the ledger. Its
 * callers are the scheduled task digest, the event-triggered submission
 * notices, and the leadership ops report (#743) -- the last of which is
 * addressed to an inbox rather than a person, hence the nullable personId.
 *
 * Runs on the service-role client, which bypasses RLS. tenant_id is therefore
 * written explicitly rather than left to its column default: default_tenant_id()
 * resolves to null for a sessionless caller once a second tenant exists.
 */

export type DeliveryOutcome = "sent" | "skipped" | "failed";

export type DeliveryRequest = {
  tenantId: string;
  /**
   * The recipient's people.id, or null for a send addressed to the
   * organization -- the ops report's configured inbox has no `people` row
   * behind it. A null row dedupes on the partial unique index added in
   * 20260907120000 rather than on the four-column constraint, since Postgres
   * treats NULLs in a unique index as distinct.
   */
  personId: string | null;
  /** A NOTIFICATION_KINDS key. */
  kind: string;
  /** What makes this send unique within its kind. */
  dedupeKey: string;
  to: string;
  /**
   * A thunk, not a value: a claim that loses the race renders nothing, and a
   * digest body costs a pass over someone's whole outstanding workload.
   */
  render: () => RenderedEmail;
  /** Overrides EMAIL_REPLY_TO for this message. */
  replyTo?: string;
  /** Tag on this sender's log lines, e.g. "[task-digest]". */
  logPrefix: string;
};

export async function deliverEmail(
  admin: SupabaseClient,
  request: DeliveryRequest,
): Promise<DeliveryOutcome> {
  const { data: claimed, error: claimError } = await admin
    .from("notification_deliveries")
    .insert({
      tenant_id: request.tenantId,
      person_id: request.personId,
      kind: request.kind,
      dedupe_key: request.dedupeKey,
      status: "pending",
    })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") return "skipped";
    console.error(
      `${request.logPrefix} could not claim a delivery row; skipping this recipient`,
      claimError,
    );
    return "failed";
  }

  const message = request.render();
  const result = await sendEmail({
    to: request.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    ...(request.replyTo ? { replyTo: request.replyTo } : {}),
  });

  const { error: finalizeError } = await admin
    .from("notification_deliveries")
    .update(
      result.ok
        ? {
            status: "sent",
            provider_message_id: result.id,
            sent_at: new Date().toISOString(),
          }
        : { status: "failed", error: result.error },
    )
    .eq("id", claimed.id as string);

  // A finalize failure does not undo the send, so it must not look like one:
  // the row stays 'pending' and the log is the only place that says otherwise.
  if (finalizeError) {
    console.error(
      `${request.logPrefix} sent, but could not record the outcome for delivery ${claimed.id}`,
      finalizeError,
    );
  }

  return result.ok ? "sent" : "failed";
}
