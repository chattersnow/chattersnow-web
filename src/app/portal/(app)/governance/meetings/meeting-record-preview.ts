// What a meeting surface hands the record preview sheet (#1225): which loader
// answers each kind, and which kinds this viewer may not read.
//
// Kept out of `meeting-context-shared.ts` on purpose -- that module is
// imported by the export formatters and their unit tests, and it should not
// start dragging Server Actions (and therefore the Supabase server client)
// into a `bun test` process to do it.
import type {
  RecordPreviewKind,
  RecordPreviewLoaders,
} from "@/lib/portal/record-preview";
import {
  getCalendarItemPreviewAction,
  getEventPreviewAction,
} from "../../calendar/record-preview-actions";
import type { MeetingDatedContext } from "./meeting-context-shared";

/**
 * The two kinds `calendar-entries.ts` already unifies, which are the two an
 * agenda pins. A third -- an annual requirement, a grant -- is another entry
 * here and another loader, not another sheet.
 */
export const MEETING_RECORD_PREVIEW_LOADERS: RecordPreviewLoaders = {
  event: getEventPreviewAction,
  calendar_item: getCalendarItemPreviewAction,
};

/**
 * The kinds whose references must render as plain text, read off the dated
 * context's own gaps rather than fetched again.
 *
 * `listMeetingDatedContextAction` already resolves `events:view` and
 * `content_calendar:view` for this viewer and reports a `forbidden` gap for
 * each one it could not read -- the `board` role holds governance at manage
 * and events at none, which is exactly the person who would otherwise be
 * offered a link that can only refuse. A gap of reason `error` is left
 * previewable: a read that failed once says nothing about permission.
 */
export function forbiddenPreviewKinds(
  context: MeetingDatedContext | undefined,
): RecordPreviewKind[] {
  const kinds: RecordPreviewKind[] = [];
  for (const gap of context?.gaps ?? []) {
    if (gap.reason !== "forbidden") continue;
    kinds.push(gap.source === "events" ? "event" : "calendar_item");
  }
  return kinds;
}
