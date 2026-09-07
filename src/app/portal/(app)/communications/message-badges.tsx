import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";
import type { ContactMessageStatus } from "./message-types";

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
