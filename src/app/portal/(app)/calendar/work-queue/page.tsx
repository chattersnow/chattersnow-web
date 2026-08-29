import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { HowToSection, HowToSheet } from "@/components/how-to-sheet";
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

  const [{ data: userData }, items, ownersResult] = await Promise.all([
    supabase.auth.getUser(),
    listWorkQueueItems(supabase),
    listCalendarOwnersAction(),
  ]);

  const currentUserId = userData.user?.id ?? null;
  const owners = "data" in ownersResult ? ownersResult.data : [];

  const myWorkItems = currentUserId
    ? items
        .filter(
          (item) =>
            item.content_opportunity &&
            isMyContentWork(item.content_opportunity, currentUserId),
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
      <div className="rainbow-accent w-16" />
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Work queue
      </h1>

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

        <HowToSheet title="How the work queue works">
          <HowToSection heading="Steps">
            <ol className="list-decimal space-y-2 pl-4">
              <li>
                <strong className="text-foreground">Draft</strong> — an
                opportunity starts here (statuses <code>not_planned</code>,{" "}
                <code>idea</code>, or <code>draft</code>), due two-thirds of the
                way through its lead time, before the publish date.
              </li>
              <li>
                <strong className="text-foreground">Review</strong> — once
                it&apos;s <code>in_review</code> or sent back as{" "}
                <code>changes_requested</code>, the due date shifts to the last
                third of the lead time.
              </li>
              <li>
                <strong className="text-foreground">Publish</strong> — once{" "}
                <code>approved</code> or <code>scheduled</code>, the due date is
                the publish date itself.
              </li>
            </ol>
          </HowToSection>
          <HowToSection heading="Who can do this">
            <p>
              Owners and reviewers work their own items from{" "}
              <strong className="text-foreground">My work</strong>; anyone with
              manage access to the content calendar can act on anything in the{" "}
              <strong className="text-foreground">Upcoming queue</strong>.
            </p>
          </HowToSection>
          <HowToSection heading="What happens downstream">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                An item is Overdue when its current stage&apos;s due date has
                passed; nothing is ever overdue once it reaches{" "}
                <code>published</code> or <code>skipped</code>.
              </li>
              <li>
                Status changes here are written to the audit log alongside the
                rest of the calendar item&apos;s history.
              </li>
            </ul>
          </HowToSection>
          <HowToSection heading="Common mistakes">
            <ul className="list-disc space-y-2 pl-4">
              <li>
                Leaving the owner or reviewer fields blank means the item never
                shows up in anyone&apos;s My work tab, only in the general
                queue.
              </li>
              <li>
                Sending an item back to <code>changes_requested</code>{" "}
                doesn&apos;t reset it to the draft stage&apos;s due-date math —
                it moves to the review stage&apos;s, which can shorten the time
                left.
              </li>
            </ul>
          </HowToSection>
        </HowToSheet>
      </div>

      {tab === "my-work" ? (
        <WorkQueueTable
          items={myWorkItems}
          owners={owners}
          currentUserId={currentUserId}
          emptyMessage="Nothing is assigned to you as an owner or reviewer right now."
        />
      ) : (
        <WorkQueueTable
          items={queueItems}
          owners={owners}
          currentUserId={currentUserId}
          emptyMessage={
            overdueOnly
              ? "Nothing is overdue right now."
              : "No calendar items to show."
          }
        />
      )}
    </>
  );
}
