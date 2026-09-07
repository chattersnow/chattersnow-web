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
};
