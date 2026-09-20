import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  NO_RECORD_MESSAGES,
  type MessageActor,
  type RecordMessages,
  type RecordMessageRow,
} from "@/lib/outbound-messages";

/**
 * What has been sent from the portal about a set of records, and who sent it
 * (#1204).
 *
 * One loader for every queue that shows a message history, because the query
 * is the whole of it: `outbound_messages` is polymorphic, its select policy is
 * evaluated against each row's own `module`, and `list_outbound_message_actors`
 * is gated the same way -- so a caller passes the record type and its ids and
 * needs no gate of its own. RLS answers with nothing at all for a reader who
 * does not hold the module's `manage`, which is the floor; the `canManage`
 * check at the call site only saves the round trip.
 *
 * Plural on purpose. The gear request reads one record because it is a detail
 * page, but the applications and contact-message queues render a sheet per row
 * of a list, and one query for the page beats one per sheet.
 */
export async function loadRecordMessages(
  supabase: SupabaseClient,
  recordType: string,
  recordIds: string[],
): Promise<RecordMessages> {
  if (recordIds.length === 0) return NO_RECORD_MESSAGES;

  const { data, error } = await supabase
    .from("outbound_messages")
    .select(
      "id, record_id, subject, kind, status, created_at, sent_by, batch_id",
    )
    .eq("record_type", recordType)
    .in("record_id", recordIds)
    .order("created_at", { ascending: false });

  if (error) return NO_RECORD_MESSAGES;

  const rows = (data ?? []) as (RecordMessageRow & { record_id: string })[];
  const byRecord: Record<string, RecordMessageRow[]> = {};
  for (const { record_id, ...message } of rows) {
    (byRecord[record_id] ??= []).push(message);
  }

  // Keyed on the messages rather than on the user ids they name: the function
  // gates on each row's own module, so asking by message id is what keeps one
  // function honest across every module that adopts this.
  const messageIds = rows.filter((row) => row.sent_by).map((row) => row.id);
  if (messageIds.length === 0) return { byRecord, actors: [] };

  const { data: actors } = await supabase.rpc("list_outbound_message_actors", {
    p_message_ids: messageIds,
  });

  return { byRecord, actors: (actors ?? []) as MessageActor[] };
}
