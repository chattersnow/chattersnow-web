import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCurrentPersonId } from "@/lib/auth/current-person";
import { Button } from "@/components/ui/button";
import { listCalendarOwnersAction } from "../actions";
import { listWorkQueueItems } from "../queries";
import { WorkQueueTable } from "../work-queue-table";
import {
  effectiveDueDate,
  isMyContentWork,
  overdueStage,
} from "../content-opportunity-shared";

type WorkQueueTab = "my-work" | "queue";

type WorkQueuePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Work Queue",
};

export default async function WorkQueuePage({
  searchParams,
}: WorkQueuePageProps) {
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const tab: WorkQueueTab = raw("tab") === "queue" ? "queue" : "my-work";
  const overdueOnly = raw("filter") === "overdue";

  // owner_id/reviewer_id are people ids, so "my work" has to match on the
  // signed-in user's people row, not their auth id.
  const [currentPersonId, items, ownersResult] = await Promise.all([
    resolveCurrentPersonId(supabase),
    listWorkQueueItems(supabase),
    listCalendarOwnersAction(),
  ]);
  const owners = "data" in ownersResult ? ownersResult.data : [];

  const myWorkItems = currentPersonId
    ? items
        .filter(
          (item) =>
            item.content_opportunity &&
            isMyContentWork(item.content_opportunity, currentPersonId),
        )
        .sort((a, b) => {
          const aChanged = a.content_opportunity?.status_changed_at ?? "";
          const bChanged = b.content_opportunity?.status_changed_at ?? "";
          return bChanged.localeCompare(aChanged);
        })
    : [];

  const queueItems = items
    .filter((item) => {
      if (!overdueOnly) return true;
      return Boolean(
        item.content_opportunity &&
        overdueStage(item.content_opportunity) !== null,
      );
    })
    .sort((a, b) => {
      const aDue = a.content_opportunity
        ? effectiveDueDate(a.content_opportunity)
        : null;
      const bDue = b.content_opportunity
        ? effectiveDueDate(b.content_opportunity)
        : null;
      if (!aDue && !bDue) return 0;
      if (!aDue) return 1;
      if (!bDue) return -1;
      return aDue.localeCompare(bDue);
    });

  function tabHref(nextTab: WorkQueueTab) {
    const sp = new URLSearchParams();
    sp.set("tab", nextTab);
    if (nextTab === "queue" && overdueOnly) sp.set("filter", "overdue");
    return `/portal/calendar/work-queue?${sp.toString()}`;
  }

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Work Queue
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="rainbow-surface mt-6 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1 rounded-lg border border-input p-1">
            <Button
              type="button"
              size="sm"
              variant={tab === "my-work" ? "default" : "ghost"}
              nativeButton={false}
              render={<Link href={tabHref("my-work")} />}
            >
              My work
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tab === "queue" ? "default" : "ghost"}
              nativeButton={false}
              render={<Link href={tabHref("queue")} />}
            >
              Upcoming queue
            </Button>
          </div>

          {tab === "queue" && (
            <Button
              type="button"
              size="sm"
              variant={overdueOnly ? "default" : "secondary"}
              nativeButton={false}
              render={
                <Link
                  href={
                    overdueOnly
                      ? "/portal/calendar/work-queue?tab=queue"
                      : "/portal/calendar/work-queue?tab=queue&filter=overdue"
                  }
                />
              }
            >
              Overdue only
            </Button>
          )}
        </div>
      </div>

      {tab === "my-work" ? (
        <WorkQueueTable
          items={myWorkItems}
          owners={owners}
          currentPersonId={currentPersonId}
          emptyMessage="Nothing is assigned to you as an owner or reviewer right now"
          emptyDescription="Items land here when you are set as owner or reviewer on a calendar item."
        />
      ) : (
        <WorkQueueTable
          items={queueItems}
          owners={owners}
          currentPersonId={currentPersonId}
          emptyMessage={
            overdueOnly
              ? "Nothing is overdue right now"
              : "No calendar items to show"
          }
          emptyDescription={
            overdueOnly
              ? "Turn off Overdue only above to see the whole queue."
              : "Add items on the Calendar page with New calendar item, or import a batch from Calendar › Import."
          }
        />
      )}
    </>
  );
}
