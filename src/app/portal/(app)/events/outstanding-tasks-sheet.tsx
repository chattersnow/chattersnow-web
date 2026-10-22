"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useActionToast } from "@/components/portal/action-toast";
import { TaskTable } from "@/components/portal/task-table";
import {
  EVENT_OPEN_WORK_KIND_LABELS,
  EVENT_OPEN_WORK_PARAM_PREFIX,
  type EventOpenWorkRow,
} from "@/lib/portal/event-open-work";
import type { TaskFilters, TaskOwner } from "@/lib/portal/task-list";
import { toggleEventChecklistItemAction } from "./checklist-actions";
import { setEventRetroActionDoneAction } from "./retro-actions";
import { setEventSponsorFollowUpDoneAction } from "./sponsors-actions";

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The events list's outstanding work (#1661): every open checklist item,
 * retro action, sponsor follow-up and phase task across events, in the shared
 * task table (#1658) with owner, due date and event, checked off in place.
 *
 * The dashboard shows only the count and links here with `?tasks=open`, which
 * seeds `open` below. Like the event detail page's `?tab=`, that param is
 * deep-linkable in but never written back out -- sorting or paging the events
 * table drops it so the sheet doesn't reopen on every navigation. The filters
 * are URL state under a `task` prefix, so they don't collide with the events
 * table's own `status`.
 */
export function OutstandingTasksSheet({
  rows,
  filters,
  owners,
  today,
  openCount,
  defaultOpen = false,
}: {
  rows: EventOpenWorkRow[];
  filters: TaskFilters;
  owners: TaskOwner[];
  today: string;
  /** Every open task, before the filters: the dashboard's number. */
  openCount: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const renderStatus = useCallback(
    (row: EventOpenWorkRow) => <CheckOff row={row} />,
    [],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="outline" />}>
        <ClipboardList className="size-4" />
        Outstanding tasks
        <Badge variant="secondary">{openCount}</Badge>
      </SheetTrigger>
      <SheetContent side="right" size="2xl">
        <SheetHeader>
          <SheetTitle>Outstanding tasks</SheetTitle>
          <SheetDescription>
            {plural(openCount, "open task")}, overdue first. Phase tasks are
            finished on the event itself.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-4">
          <TaskTable
            rows={rows}
            filters={filters}
            owners={owners}
            today={today}
            kindLabels={EVENT_OPEN_WORK_KIND_LABELS}
            renderStatus={renderStatus}
            paramPrefix={EVENT_OPEN_WORK_PARAM_PREFIX}
            emptyMessage="No outstanding tasks match these filters."
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function setDone(row: EventOpenWorkRow, done: boolean) {
  switch (row.kind) {
    case "checklist":
      return toggleEventChecklistItemAction(row.id, done);
    case "retro_action":
      return setEventRetroActionDoneAction(row.id, done);
    case "sponsor_follow_up":
      return setEventSponsorFollowUpDoneAction(row.id, done);
    case "phase":
      // Never editable: finished by doing the work on the event page.
      return Promise.resolve({ error: "This task can't be checked off." });
  }
}

/**
 * Check a row off, or reopen it, through its source's own action. Only rows
 * the viewer may edit get here; the table renders a plain badge otherwise.
 */
function CheckOff({ row }: { row: EventOpenWorkRow }) {
  const router = useRouter();
  const { isPending, run } = useActionToast();
  function handleChange(checked: boolean) {
    run(() => setDone(row, checked), {
      success: checked ? `${row.title} — done.` : `${row.title} — reopened.`,
      error: "Could not update the task. Please try again.",
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <span className="flex items-center gap-2">
      <Checkbox
        checked={row.isDone}
        disabled={isPending}
        onCheckedChange={handleChange}
        aria-label={`Mark "${row.title}" ${row.isDone ? "not done" : "done"}`}
      />
      <span className="app-muted text-sm">{row.statusLabel}</span>
      {isPending ? <Spinner /> : null}
    </span>
  );
}
