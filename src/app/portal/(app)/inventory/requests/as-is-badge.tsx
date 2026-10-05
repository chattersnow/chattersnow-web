"use client";

import { StatusBadge } from "@/components/portal/status-badge";
import { formatInstantDate } from "@/lib/format";
import {
  asIsBadgeState,
  type AsIsRequestStatus,
} from "@/lib/gear-request-as-is-requests";

/**
 * Where a request's as-is acknowledgement stands (#1518), beside its status:
 * missing, requested by emailed link, or acknowledged through one. An
 * ordinary request acknowledged on the form shows nothing. A client component
 * so the date reads in the viewer's zone.
 */
export function GearRequestAsIsBadge({
  request,
  className,
}: {
  request: {
    status: string;
    as_is_acknowledged_at: string | null;
    as_is_method: string | null;
    as_is_request: AsIsRequestStatus | null;
  };
  className?: string;
}) {
  const state = asIsBadgeState(request);
  if (!state) return null;
  if (state.state === "acknowledged") {
    return (
      <StatusBadge tone="success" className={className}>
        As-is acknowledged
      </StatusBadge>
    );
  }
  if (state.state === "requested") {
    return (
      <StatusBadge tone="info" className={className}>
        {`As-is requested ${formatInstantDate(state.at)}`}
      </StatusBadge>
    );
  }
  return (
    <StatusBadge tone="warning" className={className}>
      As-is not recorded
    </StatusBadge>
  );
}
