import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkflowInfoCard } from "@/components/workflow-info-card";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { listProgramsAction } from "../programs/actions";
import { listCalendarOwnersAction } from "./actions";
import { listActiveContentBriefTemplatesAction } from "./templates/actions";
import { listActiveProgramSuggestionRulesAction } from "./program-suggestions/actions";
import { NewCalendarItemDialog } from "./new-calendar-item-dialog";
import { CalendarWorkspace } from "./calendar-workspace";
import { ViewToggle, type CalendarView } from "./view-toggle";
import type { ListSortColumn } from "./list-view";
import { type CalendarItemRow } from "./calendar-shared";
import { mapCalendarItemRow } from "./queries";

const VIEW_VALUES: CalendarView[] = ["list", "agenda", "month"];
const SORT_VALUES: ListSortColumn[] = [
  "title",
  "starts_at",
  "priority_tier",
  "calendar_status",
];

type CalendarPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function currentMonthParam(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "content_calendar", "manage");

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const view: CalendarView = VIEW_VALUES.includes(raw("view") as CalendarView)
    ? (raw("view") as CalendarView)
    : "list";
  const month = raw("month") || currentMonthParam();

  const sort: ListSortColumn = SORT_VALUES.includes(
    raw("sort") as ListSortColumn,
  )
    ? (raw("sort") as ListSortColumn)
    : "starts_at";
  const dir: "asc" | "desc" = raw("dir") === "desc" ? "desc" : "asc";

  const typeFilter = raw("type") || "all";
  const categoryFilter = raw("category") || "all";
  const priorityFilter = raw("priority") || "all";
  const programFilter = raw("program") || "all";
  const ownerFilter = raw("owner") || "all";
  const visibilityFilter = raw("visibility") || "all";
  const statusFilter = raw("status") || "all";
  const decisionFilter = raw("decision") || "all";

  const categorySelect =
    categoryFilter !== "all"
      ? "calendar_item_categories!inner(category)"
      : "calendar_item_categories(category)";
  const programSelect =
    programFilter !== "all"
      ? "calendar_item_programs!inner(program_id)"
      : "calendar_item_programs(program_id)";

  let query = supabase
    .from("calendar_items")
    .select(
      `id, title, item_type, starts_at, ends_at, time_zone, recurrence_rule, summary, priority_tier, priority_rationale, calendar_status, visibility, owner_id, decision, decision_note, source, region, exceptions, is_sensitive_topic, tone_guidance, sensitive_review_by, sensitive_review_at, series_key, recurrence_start_month, recurrence_start_day, recurrence_end_month, recurrence_end_day, recurrence_end_is_month_end, ${categorySelect}, ${programSelect}, content_opportunities(id, calendar_item_id, content_status, skip_reason, chatter_connection, recommended_formats, recommended_action, outstanding_work, internal_notes, owner_id, reviewer_id, lead_time_days, publish_due_at, review_due_at, draft_due_at, status_changed_by, status_changed_at, template_id, template_version_id, template_field_values, content_brief_template_versions!content_opportunities_template_version_id_fkey(id, version, fields), content_permissions(id, content_opportunity_id, permitted_use, usage_limits, consent_on_file_at, recorded_by, created_at))`,
    )
    .order(sort, { ascending: dir === "asc" })
    .order("id", { ascending: true });

  if (typeFilter !== "all") query = query.eq("item_type", typeFilter);
  if (priorityFilter !== "all")
    query = query.eq("priority_tier", Number(priorityFilter));
  if (ownerFilter !== "all") query = query.eq("owner_id", ownerFilter);
  if (visibilityFilter !== "all")
    query = query.eq("visibility", visibilityFilter);
  if (statusFilter !== "all") query = query.eq("calendar_status", statusFilter);
  if (decisionFilter === "none") query = query.is("decision", null);
  else if (decisionFilter !== "all")
    query = query.eq("decision", decisionFilter);
  if (categoryFilter !== "all")
    query = query.eq("calendar_item_categories.category", categoryFilter);
  if (programFilter !== "all")
    query = query.eq("calendar_item_programs.program_id", programFilter);

  const { data: rows, error } = await query;

  const items: CalendarItemRow[] = (rows ?? []).map(mapCalendarItemRow);

  const ownersResult = await listCalendarOwnersAction();
  const owners = "data" in ownersResult ? ownersResult.data : [];
  const programsResult = await listProgramsAction();
  const programs = "data" in programsResult ? programsResult.data : [];
  const templatesResult = await listActiveContentBriefTemplatesAction();
  const activeTemplates = "data" in templatesResult ? templatesResult.data : [];
  const suggestionRulesResult = await listActiveProgramSuggestionRulesAction();
  const programSuggestionRules =
    "data" in suggestionRulesResult ? suggestionRulesResult.data : [];

  const { data: leadTimeSetting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "content.default_lead_time_days")
    .maybeSingle();
  const defaultLeadTimeDays =
    typeof leadTimeSetting?.value === "number" ? leadTimeSetting.value : 21;

  const filterParams = new URLSearchParams();
  if (typeFilter !== "all") filterParams.set("type", typeFilter);
  if (categoryFilter !== "all") filterParams.set("category", categoryFilter);
  if (priorityFilter !== "all") filterParams.set("priority", priorityFilter);
  if (programFilter !== "all") filterParams.set("program", programFilter);
  if (ownerFilter !== "all") filterParams.set("owner", ownerFilter);
  if (visibilityFilter !== "all")
    filterParams.set("visibility", visibilityFilter);
  if (statusFilter !== "all") filterParams.set("status", statusFilter);
  if (decisionFilter !== "all") filterParams.set("decision", decisionFilter);

  function viewHref(nextView: CalendarView) {
    const sp = new URLSearchParams(filterParams);
    sp.set("view", nextView);
    if (nextView === "month") sp.set("month", month);
    return `/portal/calendar?${sp.toString()}`;
  }

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Calendar
      </h1>

      <div className="mt-6">
        <WorkflowInfoCard title="How calendar items work">
          <ol className="list-decimal space-y-2 pl-4">
            <li>
              <strong className="text-foreground">Priority tier</strong> — Tier
              1 items need an explicit Plan, Skip, or Defer decision before
              their date passes (once it&apos;s Tier 1, undecided, and not
              archived, the item is flagged as needing one). Tiers 2 and 3
              don&apos;t require a decision.
            </li>
            <li>
              <strong className="text-foreground">Sensitive topic</strong> —
              flagging an item this way surfaces tone guidance and requires
              someone with manage access to record a review before it&apos;s
              considered handled; unreviewed sensitive items are flagged the
              same way as undecided Tier 1 items.
            </li>
            <li>
              <strong className="text-foreground">Content opportunity</strong> —
              items with a linked content opportunity move through their own
              draft/review/publish stages, tracked on the{" "}
              <Link
                href="/portal/calendar/work-queue"
                className="underline hover:text-foreground"
              >
                Work queue
              </Link>{" "}
              page.
            </li>
          </ol>
        </WorkflowInfoCard>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        {canManage ? (
          <NewCalendarItemDialog
            owners={owners}
            programs={programs}
            programSuggestionRules={programSuggestionRules}
          />
        ) : (
          <div />
        )}
        <ViewToggle view={view} hrefFor={viewHref} />
      </div>

      {error ? (
        <p className="app-muted mt-6 px-4 py-6 text-sm">
          Could not load calendar items. Please try again.
        </p>
      ) : (
        <div className="mt-2">
          <CalendarWorkspace
            view={view}
            month={month}
            items={items}
            owners={owners}
            programs={programs}
            activeTemplates={activeTemplates}
            defaultLeadTimeDays={defaultLeadTimeDays}
            programSuggestionRules={programSuggestionRules}
            canManage={canManage}
            filterQuery={filterParams.toString()}
            sort={sort}
            dir={dir}
            typeFilter={typeFilter}
            categoryFilter={categoryFilter}
            priorityFilter={priorityFilter}
            programFilter={programFilter}
            ownerFilter={ownerFilter}
            visibilityFilter={visibilityFilter}
            statusFilter={statusFilter}
            decisionFilter={decisionFilter}
          />
        </div>
      )}
    </>
  );
}
