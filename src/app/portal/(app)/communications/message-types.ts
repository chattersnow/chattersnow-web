import type { Claimant } from "@/components/portal/queue-claims";
import { CLAIM_FK } from "@/lib/queue-claims";

/**
 * URL parameter the notification email (#742) links one message with.
 *
 * Here rather than beside the sheet that consumes it because the page reading
 * it is a Server Component: a non-component export from a "use client" module
 * reaches the server as a client-reference proxy, not as the string, so
 * `searchParams[MESSAGE_PARAM]` silently resolved to undefined.
 */
export const MESSAGE_PARAM = "message";

export const CONTACT_MESSAGE_STATUSES = ["new", "read", "resolved"] as const;
export type ContactMessageStatus = (typeof CONTACT_MESSAGE_STATUSES)[number];

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  status: ContactMessageStatus;
  created_at: string;
  /** Who is working the message (#1670). */
  claimant: Claimant;
};

/** The columns a `ContactMessage` is read with. */
export const CONTACT_MESSAGE_SELECT = `id, name, email, topic, message, status, created_at, claimant:people!${CLAIM_FK.contact_messages}(id, name, preferred_name)`;
