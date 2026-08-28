"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp } from "@/lib/get-client-ip";
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

  const { error } = await supabase.rpc("submit_contact_message", {
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

  return { success: true };
}
