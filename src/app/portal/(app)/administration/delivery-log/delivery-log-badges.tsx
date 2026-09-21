import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";

/**
 * What each delivery status means to somebody reading the log, as a tone and a
 * word.
 *
 * "Pending" is two states wearing one value. A row is claimed, the provider is
 * called and the row is finalized inside a single request, so a fresh pending
 * row is a send in flight -- and an old one is a crash between the two writes,
 * or a finalize that failed on its own. The second is a bug somebody should
 * see, so it is given its own tone and its own word rather than sharing with
 * the first (#1310).
 */
const STATUS_TONES: Record<string, StatusTone> = {
  sent: "success",
  failed: "danger",
  skipped: "neutral",
  pending: "progress",
};

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  failed: "Failed",
  skipped: "Not sent",
  pending: "Sending",
};

export function DeliveryStatusBadge({
  status,
  stuck = false,
}: {
  status: string;
  stuck?: boolean;
}) {
  if (status === "pending" && stuck) {
    return <StatusBadge tone="warning">Stuck</StatusBadge>;
  }
  return (
    <StatusBadge tone={STATUS_TONES[status] ?? "neutral"}>
      {STATUS_LABELS[status] ?? status}
    </StatusBadge>
  );
}
