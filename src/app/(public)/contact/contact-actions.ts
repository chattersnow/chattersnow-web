"use server";

import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/get-client-ip";
import { notifyNewContactMessage } from "@/lib/notifications/submission-notifications";
import { parseContactForm } from "./contact-form-parser";

export type SubmitContactMessageResult = { error: string } | { success: true };

const ERROR_MESSAGES: Record<string, string> = {
  NAME_REQUIRED: "Name is required.",
  INVALID_EMAIL: "A valid email is required.",
  TOPIC_REQUIRED: "Please choose a topic.",
  MESSAGE_REQUIRED: "Message is required.",
  RATE_LIMITED: "Too many attempts — please try again in a few minutes.",
};

// Public, unauthenticated action: anyone can send a contact message.
// Validation, the honeypot check, and the rate limit are all re-enforced
// authoritatively inside the submit_contact_message() RPC, since anon has
// no direct table access to contact_messages.
export async function submitContactMessageAction(
  formData: FormData,
): Promise<SubmitContactMessageResult> {
  const parsed = parseContactForm(formData);
  if ("error" in parsed) return parsed;

  const honeypot = String(formData.get("company") ?? "");
  const ipAddress = await getClientIp();

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("submit_contact_message", {
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_topic: parsed.data.topic,
    p_message: parsed.data.message,
    p_honeypot: honeypot,
    p_ip_address: ipAddress,
  });

  if (error) {
    return {
      error:
        ERROR_MESSAGES[error.message] ??
        "Could not send your message. Please try again.",
    };
  }

  // After the response, never before it (#742). Telling the ops inbox about a
  // message is the organization's business, not the visitor's: a slow provider
  // or a missing key must not hold up "thanks, we got it", and a failed send
  // must not turn a committed message into an error on screen.
  //
  // The first place the public surface uses the service-role client. Nothing
  // user-controlled reaches it: the only input is the id the RPC just minted,
  // and the notifier treats an id with no row behind it as a filled honeypot
  // and returns silently.
  after(async () => {
    await notifyNewContactMessage(createSupabaseAdminClient(), {
      messageId: data as string,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    });
  });

  return { success: true };
}
