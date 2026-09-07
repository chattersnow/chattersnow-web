"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LinkPendingPulse } from "@/components/link-pending";
import type { EventTaskGroup } from "@/lib/portal/attention-items";
import { formatInstantDate } from "@/lib/format";

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The events list's outstanding-work triage surface. Replaces the truncated
 * task list that used to live on the dashboard's Upcoming card: the dashboard
 * now shows only the count and links here with `?tasks=open`, which seeds
 * `open` below. Like the event detail page's `?tab=`, that param is
 * deep-linkable in but never written back out -- sorting or paging the table
 * drops it so the sheet doesn't reopen on every navigation.
 */
export function OutstandingTasksSheet({
  groups,
  totalCount,
  defaultOpen = false,
}: {
  groups: EventTaskGroup[];
  totalCount: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="outline" />}>
        <ClipboardList className="size-4" />
        Outstanding tasks
        <Badge variant="secondary">{totalCount}</Badge>
      </SheetTrigger>
      <SheetContent side="right" size="md">
        <SheetHeader>
          <SheetTitle>Outstanding tasks</SheetTitle>
          <SheetDescription>
            {plural(totalCount, "open task")} across{" "}
            {plural(groups.length, "event")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
          {groups.map((group) => (
            <div key={group.eventId}>
              <div className="flex items-baseline justify-between gap-3 border-b pb-1.5">
                <Link
                  href={`/portal/events/${group.eventId}`}
                  className="truncate text-sm font-medium hover:underline"
                  title={group.eventName}
                  onClick={() => setOpen(false)}
                >
                  <LinkPendingPulse>{group.eventName}</LinkPendingPulse>
                </Link>
                <span className="app-muted shrink-0 text-xs">
                  {formatInstantDate(group.eventStartsAt)}
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {group.tasks.map((task) => (
                  <li key={task.key}>
                    <Link
                      href={task.href}
                      className="text-primary text-sm hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      <LinkPendingPulse>{task.taskLabel}</LinkPendingPulse>
                    </Link>
                    {task.kind === "checklist" && (
                      <span className="app-muted ml-1.5 text-xs">
                        · Checklist
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
