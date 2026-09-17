"use client";

import Link from "next/link";
import { Check, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCalendarDate } from "@/lib/format";
import {
  meetingContextEntryDay,
  meetingContextSourceKey,
  type MeetingContextGap,
  type MeetingDatedContext,
  type MeetingContextEntry,
} from "./meeting-context-shared";

/**
 * The calendar's answer to "what is coming up", beside the agenda (#1223).
 *
 * Live, not stored: it queries on render, so a rescheduled event is right the
 * next time anyone opens the agenda. Pinning is the only write, and it copies
 * one row into the agenda's own "Upcoming dates" list -- which is what carries
 * a date into the frozen minutes and the printed export.
 *
 * A pinned row stays in this list, marked. Removing it would reorder
 * everything below the button the moment it was clicked, which is how a second
 * pin lands on the wrong row.
 */

const GAP_MESSAGES: Record<
  MeetingContextGap["source"],
  Record<MeetingContextGap["reason"], string>
> = {
  events: {
    forbidden: "Events are not shown — your role does not include Events.",
    error: "Events could not be loaded.",
  },
  calendar_items: {
    forbidden:
      "Calendar items are not shown — your role does not include the Content Calendar.",
    error: "Calendar items could not be loaded.",
  },
};

function EntryRow({
  entry,
  pinned,
  onPin,
}: {
  entry: MeetingContextEntry;
  pinned: boolean;
  onPin?: (entry: MeetingContextEntry) => void;
}) {
  return (
    <li className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:gap-3">
      <span className="app-muted shrink-0 text-sm sm:w-28">
        {formatCalendarDate(meetingContextEntryDay(entry))}
      </span>
      <div className="min-w-0 flex-1">
        <Link
          href={entry.href}
          className="text-sm text-[var(--purple-deep)] underline"
        >
          {entry.title}
        </Link>
        <p className="app-muted text-xs">
          {entry.kind === "event" ? "Event" : "Calendar item"}
        </p>
      </div>
      {onPin &&
        (pinned ? (
          <span className="app-muted flex shrink-0 items-center gap-1 text-xs">
            <Check className="size-3.5" /> Added
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onPin(entry)}
          >
            <Pin /> Add to agenda
          </Button>
        ))}
    </li>
  );
}

export function MeetingDatedContext({
  context,
  loadError,
  pinnedKeys,
  onPin,
}: {
  /** `undefined` while the read is in flight. */
  context: MeetingDatedContext | undefined;
  loadError: string | null;
  /** `${kind}:${id}` for every row already in the agenda's upcoming dates. */
  pinnedKeys?: Set<string>;
  /** Omitted in view mode: the pin is an edit to the agenda. */
  onPin?: (entry: MeetingContextEntry) => void;
}) {
  return (
    <div>
      <p className="text-sm font-semibold">Next 30 days</p>
      {context && (
        <p className="app-muted text-xs">
          {formatCalendarDate(context.window.fromDate)} –{" "}
          {formatCalendarDate(context.window.toDate)}, from the calendar and
          events
        </p>
      )}

      {loadError ? (
        <p className="app-muted mt-1 text-sm">{loadError}</p>
      ) : context === undefined ? (
        <Skeleton className="mt-2 h-16 w-full" />
      ) : (
        <>
          {context.entries.length === 0 ? (
            <p className="app-muted mt-1 text-sm">Nothing scheduled.</p>
          ) : (
            <ul className="mt-1 divide-y divide-[var(--line)]">
              {context.entries.map((entry) => {
                const key = meetingContextSourceKey(entry);
                return (
                  <EntryRow
                    key={key}
                    entry={entry}
                    pinned={pinnedKeys?.has(key) ?? false}
                    onPin={onPin}
                  />
                );
              })}
            </ul>
          )}
          {context.gaps.map((gap) => (
            <p key={gap.source} className="app-muted mt-1 text-xs">
              {GAP_MESSAGES[gap.source][gap.reason]}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
