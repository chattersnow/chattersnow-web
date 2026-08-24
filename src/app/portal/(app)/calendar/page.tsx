import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { listProgramsAction } from "../programs/actions";
import { listCalendarOwnersAction } from "./actions";
import { listActiveContentBriefTemplatesAction } from "./templates/actions";
import { NewCalendarItemDialog } from "./new-calendar-item-dialog";
import { CalendarWorkspace } from "./calendar-workspace";
import { ViewToggle, type CalendarView } from "./view-toggle";
import type { ListSortColumn } from "./list-view";
import {
  CATEGORIES,
  CALENDAR_STATUSES,
  ITEM_TYPES,
  PRIORITY_TIERS,
  VISIBILITIES,
  type CalendarItemRow,
} from "./calendar-shared";

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
      `id, title, item_type, starts_at, ends_at, time_zone, recurrence_rule, summary, priority_tier, priority_rationale, calendar_status, visibility, owner_id, decision, decision_note, ${categorySelect}, ${programSelect}, content_opportunities(id, calendar_item_id, content_status, skip_reason, chatter_connection, recommended_formats, recommended_action, outstanding_work, owner_id, reviewer_id, lead_time_days, publish_due_at, review_due_at, draft_due_at, status_changed_by, status_changed_at, template_id, template_version_id, template_field_values, content_brief_template_versions!content_opportunities_template_version_id_fkey(id, version, fields))`,
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

  const items: CalendarItemRow[] = (rows ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      title: string;
      item_type: string;
      starts_at: string;
      ends_at: string | null;
      time_zone: string;
      recurrence_rule: string | null;
      summary: string | null;
      priority_tier: number;
      priority_rationale: string | null;
      calendar_status: string;
      visibility: string;
      owner_id: string | null;
      decision: string | null;
      decision_note: string | null;
      calendar_item_categories: { category: string }[] | null;
      calendar_item_programs: { program_id: string }[] | null;
      content_opportunities:
        | (Omit<
            NonNullable<CalendarItemRow["content_opportunity"]>,
            "template_version"
          > & {
            content_brief_template_versions: NonNullable<
              CalendarItemRow["content_opportunity"]
            >["template_version"];
          })
        | null;
    };
    return {
      id: r.id,
      title: r.title,
      item_type: r.item_type,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      time_zone: r.time_zone,
      recurrence_rule: r.recurrence_rule,
      summary: r.summary,
      priority_tier: r.priority_tier,
      priority_rationale: r.priority_rationale,
      calendar_status: r.calendar_status,
      visibility: r.visibility,
      owner_id: r.owner_id,
      decision: r.decision,
      decision_note: r.decision_note,
      categories: (r.calendar_item_categories ?? []).map((c) => c.category),
      program_ids: (r.calendar_item_programs ?? []).map((p) => p.program_id),
      content_opportunity: r.content_opportunities
        ? (() => {
            const { content_brief_template_versions, ...opportunity } =
              r.content_opportunities;
            return {
              ...opportunity,
              template_version: content_brief_template_versions,
            };
          })()
        : null,
    };
  });

  const ownersResult = await listCalendarOwnersAction();
  const owners = "data" in ownersResult ? ownersResult.data : [];
  const programsResult = await listProgramsAction();
  const programs = "data" in programsResult ? programsResult.data : [];
  const templatesResult = await listActiveContentBriefTemplatesAction();
  const activeTemplates = "data" in templatesResult ? templatesResult.data : [];

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

  const hasActiveFilters = filterParams.toString().length > 0;

  const selectClassName =
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  return (
    <>
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Calendar
      </h1>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        {canManage ? (
          <NewCalendarItemDialog owners={owners} programs={programs} />
        ) : (
          <div />
        )}
        <ViewToggle view={view} hrefFor={viewHref} />
      </div>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        {view === "month" && <input type="hidden" name="month" value={month} />}

        <div className="flex flex-col gap-1">
          <label
            htmlFor="type"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Type
          </label>
          <select
            id="type"
            name="type"
            defaultValue={typeFilter}
            className={selectClassName}
          >
            <option value="all">All types</option>
            {ITEM_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="category"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={categoryFilter}
            className={selectClassName}
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="priority"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue={priorityFilter}
            className={selectClassName}
          >
            <option value="all">All tiers</option>
            {PRIORITY_TIERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="program"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Program
          </label>
          <select
            id="program"
            name="program"
            defaultValue={programFilter}
            className={selectClassName}
          >
            <option value="all">All programs</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="owner"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Owner
          </label>
          <select
            id="owner"
            name="owner"
            defaultValue={ownerFilter}
            className={selectClassName}
          >
            <option value="all">All owners</option>
            {owners.map((owner) => (
              <option key={owner.user_id} value={owner.user_id}>
                {owner.email}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="visibility"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Visibility
          </label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={visibilityFilter}
            className={selectClassName}
          >
            <option value="all">All</option>
            {VISIBILITIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="status"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={statusFilter}
            className={selectClassName}
          >
            <option value="all">All statuses</option>
            {CALENDAR_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="decision"
            className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
          >
            Decision
          </label>
          <select
            id="decision"
            name="decision"
            defaultValue={decisionFilter}
            className={selectClassName}
          >
            <option value="all">All</option>
            <option value="none">No decision</option>
            <option value="plan">Plan</option>
            <option value="skip">Skip</option>
            <option value="defer">Defer</option>
          </select>
        </div>

        <Button type="submit" variant="outline">
          Filter
        </Button>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={`/portal/calendar?view=${view}`} />}
          >
            Clear
          </Button>
        )}
      </form>

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
            canManage={canManage}
            filterQuery={filterParams.toString()}
            sort={sort}
            dir={dir}
          />
        </div>
      )}
    </>
  );
}
