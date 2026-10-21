import { formatDateInZone } from "@/lib/time";
import type { EventRow } from "../../events/event-badges";
import { deriveEventPhaseTasks } from "../../events/phase-status";
import type { AgendaItem, AgendaItemSource } from "./agenda-form";

/** An event as the agenda names it: what a pre-filled item's link points at. */
export type EventWorkEvent = {
  id: string;
  name: string;
  starts_at: string;
  timezone: string;
};

/**
 * What an event has open, as read for a committee agenda (#1624). The phase
 * fields are the ones `deriveEventPhaseTasks` reads, the same rule the
 * dashboard's Outstanding tasks and the event's section rail run on.
 */
export type EventWorkInput = {
  event: EventWorkEvent &
    Pick<
      EventRow,
      | "event_lead_id"
      | "capacity"
      | "budget_amount"
      | "attendance_count"
      | "report_status"
      | "status"
    >;
  retroItemCount: number;
  openChecklistItems: { id: string; title: string }[];
  /** This event's own open retro action items. */
  openActions: { id: string; body: string }[];
  /** Open action items from earlier events in the same program (#1578). */
  carriedForward: { id: string; body: string; event: EventWorkEvent }[];
};

export type EventWorkItem = { title: string; source: AgendaItemSource };

function sourceFor(key: string, event: EventWorkEvent): AgendaItemSource {
  return {
    key,
    kind: "event",
    id: event.id,
    label: event.name,
    date: formatDateInZone(new Date(event.starts_at), event.timezone || "UTC"),
  };
}

/**
 * The event's open work, one agenda line per piece, in the event's lifecycle
 * order: phase tasks, then checklist items, then action items (the event's own,
 * then the ones carried forward to it).
 *
 * The retro's "N open action items" phase task is left out on purpose: the
 * action items are listed one by one instead, which a committee can discuss
 * and which "Refresh from event" can deduplicate, where a count changes its
 * wording every time one closes.
 */
export function eventOpenWork(
  input: EventWorkInput,
  now: Date = new Date(),
): EventWorkItem[] {
  const { event } = input;
  const work: EventWorkItem[] = [];

  // Scoped as the dashboard scopes them: a cancelled or archived event is done
  // by definition, whatever phase was never filled in.
  const phaseTasks =
    event.status === "draft" || event.status === "published"
      ? deriveEventPhaseTasks(
          event as unknown as EventRow,
          { retroItemCount: input.retroItemCount, openActionItemCount: 0 },
          now,
          { includeRetro: true },
        )
      : [];
  for (const task of phaseTasks) {
    // The same key the dashboard's Outstanding tasks give the task.
    work.push({
      title: task.taskLabel,
      source: sourceFor(`event_${task.kind}_${event.id}`, event),
    });
  }

  for (const item of input.openChecklistItems) {
    work.push({
      title: item.title,
      source: sourceFor(`event_checklist_${item.id}`, event),
    });
  }

  for (const action of input.openActions) {
    work.push({
      title: action.body,
      source: sourceFor(`retro_action_${action.id}`, event),
    });
  }

  for (const action of input.carriedForward) {
    work.push({
      title: action.body,
      source: sourceFor(`retro_action_${action.id}`, action.event),
    });
  }

  return work;
}

/**
 * The agenda items to add for `work`: only what is not on the agenda already,
 * matched by `source.key`, so a renamed or reordered item still counts as
 * present. Never removes or changes an existing item.
 */
export function agendaItemsToAdd(
  work: EventWorkItem[],
  existing: AgendaItem[],
  newId: () => string = () => crypto.randomUUID(),
): AgendaItem[] {
  const present = new Set(
    existing.flatMap((item) => (item.source ? [item.source.key] : [])),
  );
  const added: AgendaItem[] = [];
  for (const piece of work) {
    if (present.has(piece.source.key)) continue;
    present.add(piece.source.key);
    added.push({ id: newId(), title: piece.title, source: piece.source });
  }
  return added;
}
