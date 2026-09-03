import { StatusBadge, type StatusTone } from "@/components/portal/status-badge";
import { revenueSourceLabel, type RevenueSource } from "./revenue-shared";

const SOURCE_STYLES: Record<RevenueSource, StatusTone> = {
  ticket_sales: "progress",
  registration_fees: "progress",
  merchandise: "info",
  onsite_donations: "info",
  grants: "neutral",
  other: "neutral",
};

export function RevenueSourceBadge({ source }: { source: RevenueSource }) {
  return (
    <StatusBadge tone={SOURCE_STYLES[source] ?? "neutral"}>
      {revenueSourceLabel(source)}
    </StatusBadge>
  );
}
