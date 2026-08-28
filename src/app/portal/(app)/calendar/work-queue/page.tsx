import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { WorkflowInfoCard } from "@/components/workflow-info-card";
import { listProgramsAction } from "../../programs/actions";
import { listCalendarOwnersAction } from "../actions";
import { listActiveContentBriefTemplatesAction } from "../templates/actions";
import { listActiveProgramSuggestionRulesAction } from "../program-suggestions/actions";
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
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "content_calendar", "manage");

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const tab: WorkQueueTab = raw("tab") === "queue" ? "queue" : "my-work";
  const overdueOnly = raw("filter") === "overdue";

  const [
    { data: userData },
    items,
    ownersResult,
    programsResult,
    templatesResult,
    suggestionRulesResult,
    { data: leadTimeSetting },
  ] = await Promise.all([
    supabase.auth.getUser(),
    listWorkQueueItems(supabase),
    listCalendarOwnersAction(),
    listProgramsAction(),
    listActiveContentBriefTemplatesAction(),
    listActiveProgramSuggestionRulesAction(),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "content.default_lead_time_days")
      .maybeSingle(),
  ]);

  const currentUserId = userData.user?.id ?? null;
  const owners = "data" in ownersResult ? ownersResult.data : [];
  const programs = "data" in programsResult ? programsResult.data : [];
  const activeTemplates = "data" in templatesResult ? templatesResult.data : [];
  const programSuggestionRules =
    "data" in suggestionRulesResult ? suggestionRulesResult.data : [];
  const defaultLeadTimeDays =
    typeof leadTimeSetting?.value === "number" ? leadTimeSetting.value : 21;

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
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Work queue
      </h1>

      <div className="mt-6">
        <WorkflowInfoCard title="How the work queue works">
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
          <p className="mt-3">
            An item is Overdue when its current stage&apos;s due date has
            passed; nothing is ever overdue once it reaches{" "}
            <code>published</code> or <code>skipped</code>. My work shows
            anything where you&apos;re the owner or reviewer, excluding those
            two terminal statuses.
          </p>
        </WorkflowInfoCard>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
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
            variant={overdueOnly ? "default" : "outline"}
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

      {tab === "my-work" ? (
        <WorkQueueTable
          items={myWorkItems}
          owners={owners}
          programs={programs}
          activeTemplates={activeTemplates}
          defaultLeadTimeDays={defaultLeadTimeDays}
          programSuggestionRules={programSuggestionRules}
          canManage={canManage}
          currentUserId={currentUserId}
          emptyMessage="Nothing is assigned to you as an owner or reviewer right now."
        />
      ) : (
        <WorkQueueTable
          items={queueItems}
          owners={owners}
          programs={programs}
          activeTemplates={activeTemplates}
          defaultLeadTimeDays={defaultLeadTimeDays}
          programSuggestionRules={programSuggestionRules}
          canManage={canManage}
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
