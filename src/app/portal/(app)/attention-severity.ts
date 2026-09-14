import type { StatusTone } from "@/components/portal/status-badge";
import type { AttentionSeverity } from "@/lib/portal/attention-items";

/**
 * How an attention item's severity is coloured, shared by the header's bell
 * and the mobile dashboard's list (#1079). The two show the same items, so a
 * second copy would be two answers to one question.
 */
export const SEVERITY_TONE: Record<AttentionSeverity, StatusTone> = {
  urgent: "danger",
  attention: "warning",
  info: "progress",
};
