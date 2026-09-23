"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestOrigin } from "@/lib/request-origin";
import { MY_PATH_PREFIX } from "@/lib/constituent/paths";
import { CANCELLATION_ERRORS } from "@/lib/registration-cancellation";
import { sendRegistrationCancellationNotice } from "@/lib/notifications/registration-cancellation";
import { publicEventPath } from "@/app/(public)/events/event-path";

export type CancelMyRegistrationResult = { error: string } | { success: true };

/**
 * "I can't make it" (#1418): the signed-in registrant cancelling their own
 * registration, before the event starts.
 *
 * `cancel_my_event_registration()` resolves the person itself, so whose
 * registration is cancelled is never the caller's to choose, and somebody
 * else's id reads as not found. The registrant gets the same "your
 * registration was cancelled" email staff can send, as a receipt.
 */
export async function cancelMyRegistrationAction(
  registrationId: string,
  eventId: string,
): Promise<CancelMyRegistrationResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: CANCELLATION_ERRORS.NO_RECORD };

  const { error } = await supabase.rpc("cancel_my_event_registration", {
    p_registration_id: registrationId,
  });
  if (error) {
    return {
      error:
        CANCELLATION_ERRORS[error.message] ??
        "Could not cancel your registration. Please try again.",
    };
  }

  const fallbackOrigin = await getRequestOrigin();
  after(async () => {
    await sendRegistrationCancellationNotice(createSupabaseAdminClient(), {
      registrationId,
      sentBy: user.id,
      fallbackOrigin,
    });
  });

  revalidatePath(publicEventPath(eventId));
  revalidatePath(MY_PATH_PREFIX);
  revalidatePath("/portal/events");
  return { success: true };
}
