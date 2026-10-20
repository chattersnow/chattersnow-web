import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";

export type MeetingPerson = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type MeetingEvent = {
  id: string;
  name: string;
  starts_at: string;
};

export type MeetingRow = {
  id: string;
  meeting_date: string;
  meeting_type: string;
  status: string;
  location: string | null;
  notes: string | null;
  facilitator: MeetingPerson | null;
  notetaker: MeetingPerson | null;
  /**
   * The linked event (#1622). `event_id` is kept beside the embed because the
   * embed is null for a reader who cannot see events, and a save must not
   * clear a link that reader could not see.
   */
  event_id: string | null;
  event: MeetingEvent | null;
  minutes_approved_at: string | null;
};

const TYPE_STYLES: Record<string, StatusTone> = {
  board: "progress",
  committee: "info",
  annual: "progress",
  other: "neutral",
};

const STATUS_STYLES: Record<string, StatusTone> = {
  scheduled: "progress",
  completed: "success",
  cancelled: "danger",
};

export function MeetingTypeBadge({ type }: { type: string }) {
  return (
    <StatusBadge tone={TYPE_STYLES[type] ?? "neutral"}>{type}</StatusBadge>
  );
}

export function MeetingStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={STATUS_STYLES[status] ?? "neutral"}>
      {humanizeStatus(status)}
    </StatusBadge>
  );
}
