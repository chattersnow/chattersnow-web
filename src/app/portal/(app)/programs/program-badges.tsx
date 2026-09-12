import {
  humanizeStatus,
  StatusBadge,
  type StatusTone,
} from "@/components/portal/status-badge";

export type ProgramRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  /** Whether the public Programs page lists this program (#898). */
  is_public: boolean;
  pillar: string | null;
  emoji: string | null;
  sort_order: number | null;
};

const STATUS_STYLES: Record<string, StatusTone> = {
  active: "info",
  pilot: "progress",
  retired: "neutral",
};

/**
 * Whether this program is on the public site.
 *
 * Deliberately not folded into the status badge: publication and lifecycle are
 * separate decisions here, and a retired program can be published (#898).
 */
export function ProgramPublicBadge({ isPublic }: { isPublic: boolean }) {
  return (
    <StatusBadge tone={isPublic ? "success" : "neutral"}>
      {isPublic ? "Public" : "Not public"}
    </StatusBadge>
  );
}

export function ProgramStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={STATUS_STYLES[status] ?? "neutral"}>
      {humanizeStatus(status)}
    </StatusBadge>
  );
}
