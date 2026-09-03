import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";
import type { ContactMessageStatus } from "./message-types";

// Mirrors CONTACT_TOPICS in src/app/(public)/contact/contact-form.tsx -- the
// public form's values are the only source of truth for topic keys.
export const CONTACT_TOPIC_LABELS: Record<string, string> = {
  general: "General inquiry",
  partnership: "Partnerships & sponsorship",
  volunteer: "Volunteering",
  gear: "Gear",
};

const STATUS_STYLES: Record<ContactMessageStatus, StatusTone> = {
  new: "progress",
  read: "neutral",
  resolved: "success",
};

export function ContactMessageStatusBadge({
  status,
}: {
  status: ContactMessageStatus;
}) {
  return (
    <StatusBadge tone={STATUS_STYLES[status] ?? "neutral"}>
      {humanizeStatus(status)}
    </StatusBadge>
  );
}
