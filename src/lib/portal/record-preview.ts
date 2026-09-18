// One record, read-only, opened without leaving the page that referred to it
// (#1225).
//
// The minutes are the reason this exists: "i've found myself navigating away
// from taking minutes in the agenda page to look at something else in the
// portal." #1200 made leaving safe by autosaving and #1223/#1224 turned the
// references into links, but a link still costs the notetaker their place.
//
// The shape is deliberately kind-agnostic. `event` and `calendar_item` are the
// two `calendar-entries.ts` already unifies and the only two v1 loads, but a
// third kind -- an annual requirement, a grant -- is a new loader answering
// this same object, not a second sheet.
import type { StatusTone } from "@/components/portal/status-badge";
import type { ActionFailure } from "./action-result";

export type RecordPreviewKind = "event" | "calendar_item";

export const RECORD_PREVIEW_KIND_LABELS: Record<RecordPreviewKind, string> = {
  event: "Event",
  calendar_item: "Calendar item",
};

/**
 * One labelled fact worth a line -- a count, an amount, a classification.
 * Pre-formatted by the loader, because what "1,200" or "$1,200.00" means is
 * the source module's knowledge, not the sheet's.
 */
export type RecordPreviewFigure = { label: string; value: string };

export type RecordPreview = {
  kind: RecordPreviewKind;
  id: string;
  title: string;
  /** The stored instant. Displayed in `timeZone`, not the viewer's. */
  startsAt: string;
  endsAt: string | null;
  /**
   * The record's own IANA zone. An event at 7pm in `America/Denver` read in
   * the viewer's zone is a different evening, and the notetaker is writing
   * down which evening it is.
   */
  timeZone: string;
  /** Null where the kind has no location column, as calendar items do not. */
  location: string | null;
  statusLabel: string;
  statusTone: StatusTone;
  summary: string | null;
  /** Empty where the kind has nothing worth a line. */
  figures: RecordPreviewFigure[];
  /** Where the full record is managed: the floor under "more details". */
  href: string;
};

/**
 * What a referring surface knows before anything is loaded: enough to name the
 * record in the sheet's title while the read is in flight, and to ask for it.
 */
export type RecordPreviewRef = {
  kind: RecordPreviewKind;
  id: string;
  label: string;
};

/**
 * A per-kind read. It authorizes on the record's *own* resource rather than
 * assuming the caller was gated upstream -- a governance manager without
 * `events:view` reaches these links, and must be refused here rather than
 * handed an event.
 */
export type RecordPreviewLoader = (
  id: string,
) => Promise<{ data: RecordPreview } | ActionFailure>;

/** Partial: a surface may only be able to open some kinds. */
export type RecordPreviewLoaders = Partial<
  Record<RecordPreviewKind, RecordPreviewLoader>
>;
