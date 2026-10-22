"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkUser } from "@/lib/auth/current-user";
import {
  NO_PERSON_RECORD_MESSAGE,
  isQueueKey,
  type QueueKey,
} from "@/lib/queue-claims";

export type QueueClaimActionResult = { error: string } | { success: true };

/** The list page each queue is worked from, revalidated after a claim. */
const QUEUE_PATHS: Record<QueueKey, string> = {
  gear_requests: "/portal/inventory/requests",
  person_claims: "/portal/people/claims",
  volunteer_hours: "/portal/volunteers/participation",
  volunteer_applications: "/portal/volunteers/applications",
  contact_messages: "/portal/communications",
  artwork_submissions: "/portal/artwork",
};

const CLAIM_ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: "You don't have permission to claim or assign this item.",
  ITEM_NOT_FOUND: "This item could not be found.",
  ITEM_RESOLVED: "This item is already resolved, so it can't be claimed.",
  PERSON_NOT_FOUND: "That person isn't in this organization.",
  QUEUE_INVALID: "That isn't a queue items can be claimed in.",
};

/**
 * Claim, unclaim or assign one queue item (#1668). `assignee` is "self" to
 * claim it yourself, a person id to assign it, or null to release it.
 *
 * Everything is decided by set_queue_item_claim(), which checks the queue's
 * act and assign permissions separately and refuses a resolved item; this only
 * resolves "self" and says the outcome in a sentence.
 */
export async function setQueueItemClaimAction(input: {
  queue: QueueKey;
  id: string;
  assignee: "self" | string | null;
}): Promise<QueueClaimActionResult> {
  const supabase = await createSupabaseServerClient();
  const userResult = await checkUser(
    supabase,
    "You must be signed in to claim items.",
  );
  if ("error" in userResult) return userResult;

  if (!isQueueKey(input.queue)) {
    return { error: CLAIM_ERROR_MESSAGES.QUEUE_INVALID };
  }

  let personId = input.assignee;
  if (personId === "self") {
    const { data: me } = await supabase.rpc("my_person_id");
    if (!me) return { error: NO_PERSON_RECORD_MESSAGE };
    personId = me as string;
  }

  const { error } = await supabase.rpc("set_queue_item_claim", {
    p_queue: input.queue,
    p_id: input.id,
    // The generated type says string; null is the RPC's "unclaim".
    p_person_id: personId as string,
  });

  if (error) {
    return {
      error:
        CLAIM_ERROR_MESSAGES[error.message] ??
        "Could not update this claim. Please try again.",
    };
  }

  const path = QUEUE_PATHS[input.queue];
  revalidatePath(path);
  revalidatePath(`${path}/${input.id}`);
  return { success: true };
}
