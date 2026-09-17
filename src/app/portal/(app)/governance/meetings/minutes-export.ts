import type { MinutesRow } from "./minutes-core";
import type { ActionItem } from "./action-items-actions";
import {
  formatCalendarDate,
  formatInstantDate,
  personDisplayName,
} from "@/lib/format";

/**
 * Minutes, as something to send to a board member (#1201).
 *
 * A sibling of `agenda-export.ts` rather than a mode flag on it. An agenda is
 * a plan -- seven fixed sections, each with what is *intended* -- and minutes
 * are a record whose structure is whatever the snapshot froze, so one function
 * with a branch through it would read worse than two that each say one thing.
 * The two files share nothing but their `@/lib/format` imports, which is the
 * tell.
 *
 * Action items are grouped under the snapshot item their `minutes_item_key`
 * names, so an action raised while discussing Finance reads beneath Finance.
 * Everything else -- raised out of band, or created before #1199 added the
 * column -- lands under a plain "Action items" heading at the end rather than
 * being silently dropped.
 */

export type MinutesExportInput = {
  meetingDate: string;
  minutes: MinutesRow;
  actionItems: ActionItem[];
};

function actionItemLine(item: ActionItem): string {
  const due = item.due_date
    ? ` (due ${formatCalendarDate(item.due_date)})`
    : "";
  return `${item.description} — ${personDisplayName(item.owner)}${due}`;
}

/** `minutes_item_key` -> the items raised under it, plus the unlinked rest. */
function groupActionItems(items: ActionItem[]) {
  const byKey = new Map<string, ActionItem[]>();
  const unlinked: ActionItem[] = [];
  for (const item of items) {
    if (!item.minutes_item_key) {
      unlinked.push(item);
      continue;
    }
    const existing = byKey.get(item.minutes_item_key);
    if (existing) existing.push(item);
    else byKey.set(item.minutes_item_key, [item]);
  }
  return { byKey, unlinked };
}

export function formatMinutesMarkdown(input: MinutesExportInput): string {
  const { minutes } = input;
  const items = minutes.agenda_snapshot?.items ?? [];
  const { byKey, unlinked } = groupActionItems(input.actionItems);
  const lines: string[] = [];

  lines.push(`# Minutes — ${formatInstantDate(input.meetingDate)}`);
  lines.push("");
  lines.push(minutes.status === "final" ? "Status: Final" : "Status: Draft");
  lines.push("");

  if (items.length === 0) {
    lines.push("No agenda was frozen into these minutes.");
    lines.push("");
  }

  for (const item of items) {
    lines.push(`## ${item.label}`);
    lines.push(minutes.notes[item.key]?.trim() || "No notes recorded.");
    const raised = byKey.get(item.key) ?? [];
    if (raised.length > 0) {
      lines.push("");
      lines.push("**Action items**");
      for (const action of raised) lines.push(`- ${actionItemLine(action)}`);
    }
    lines.push("");
  }

  lines.push("## Closing notes");
  lines.push(minutes.body_text?.trim() || "None.");
  lines.push("");

  lines.push("## Action items");
  if (unlinked.length === 0) {
    lines.push("None raised outside the sections above.");
  } else {
    for (const action of unlinked) lines.push(`- ${actionItemLine(action)}`);
  }

  return lines.join("\n");
}

export function formatMinutesPlainText(input: MinutesExportInput): string {
  const { minutes } = input;
  const items = minutes.agenda_snapshot?.items ?? [];
  const { byKey, unlinked } = groupActionItems(input.actionItems);
  const lines: string[] = [];

  lines.push(`MINUTES — ${formatInstantDate(input.meetingDate)}`);
  lines.push("");
  lines.push(minutes.status === "final" ? "Status: Final" : "Status: Draft");
  lines.push("");

  if (items.length === 0) {
    lines.push("  No agenda was frozen into these minutes.");
    lines.push("");
  }

  for (const item of items) {
    lines.push(item.label.toUpperCase());
    lines.push(`  ${minutes.notes[item.key]?.trim() || "No notes recorded."}`);
    const raised = byKey.get(item.key) ?? [];
    for (const action of raised) lines.push(`  - ${actionItemLine(action)}`);
    lines.push("");
  }

  lines.push("CLOSING NOTES");
  lines.push(`  ${minutes.body_text?.trim() || "None."}`);
  lines.push("");

  lines.push("ACTION ITEMS");
  if (unlinked.length === 0) {
    lines.push("  None raised outside the sections above.");
  } else {
    for (const action of unlinked) lines.push(`  - ${actionItemLine(action)}`);
  }

  return lines.join("\n");
}
