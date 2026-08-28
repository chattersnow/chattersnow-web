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
