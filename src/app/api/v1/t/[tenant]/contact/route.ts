import { afterResponse } from "@/lib/api/after-response";
import { publicWrite, unwrapId } from "@/lib/api/handler";
import { contactMessageSchema } from "@/lib/api/schemas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyNewContactMessage } from "@/lib/notifications/submission-notifications";

/**
 * Send the organization a message. The same RPC, the same rate limit and the
 * same notification the site's own contact form uses -- the hook lives in
 * `@/lib/notifications/submission-notifications` precisely so this handler and
 * that action cannot drift into notifying differently.
 */
const route = publicWrite(
  contactMessageSchema,
  async ({ supabase, body, clientIp, siteUrl }) => {
    const id = unwrapId(
      await supabase.rpc("submit_contact_message", {
        p_name: body.name,
        p_email: body.email,
        p_topic: body.topic ?? "general",
        p_message: body.message,
        p_ip_address: clientIp,
      }),
    );

    afterResponse(async () => {
      await notifyNewContactMessage(createSupabaseAdminClient(), {
        messageId: id,
        siteUrl,
      });
    });

    return { id };
  },
);

export const POST = route.POST;
export const OPTIONS = route.OPTIONS;
