import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarItemRow } from "./calendar-shared";
import {
  findMissingCoverageSeries,
  type MissingCoverageSeries,
} from "./calendar-recurrence";

export const CALENDAR_ITEM_WITH_CONTENT_OPPORTUNITY_SELECT = `id, title, item_type, starts_at, ends_at, time_zone, recurrence_rule, summary, priority_tier, priority_rationale, calendar_status, visibility, owner_id, decision, decision_note, source, region, exceptions, is_sensitive_topic, tone_guidance, sensitive_review_by, sensitive_review_at, series_key, recurrence_start_month, recurrence_start_day, recurrence_end_month, recurrence_end_day, recurrence_end_is_month_end, calendar_item_categories(category), calendar_item_programs(program_id), content_opportunities(id, calendar_item_id, content_status, skip_reason, chatter_connection, recommended_formats, recommended_action, outstanding_work, internal_notes, owner_id, reviewer_id, lead_time_days, publish_due_at, review_due_at, draft_due_at, status_changed_by, status_changed_at, template_id, template_version_id, template_field_values, content_brief_template_versions!content_opportunities_template_version_id_fkey(id, version, fields), content_permissions(id, content_opportunity_id, permitted_use, usage_limits, consent_on_file_at, recorded_by, created_at))`;

/** Columns needed to compute coverage-reminder/generate-next-year gaps -- no content_opportunities join, this isn't rendered as a full calendar item. */
const SERIES_CANDIDATE_SELECT =
  "id, title, item_type, starts_at, time_zone, summary, priority_tier, priority_rationale, calendar_status, recurrence_rule, source, region, is_sensitive_topic, tone_guidance, series_key, recurrence_start_month, recurrence_start_day, recurrence_end_month, recurrence_end_day, recurrence_end_is_month_end, calendar_item_categories(category), calendar_item_programs(program_id)";

type RawCalendarItemRow = {
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
  source: string | null;
  region: string | null;
  exceptions: unknown[];
  is_sensitive_topic: boolean;
  tone_guidance: string | null;
  sensitive_review_by: string | null;
  sensitive_review_at: string | null;
  series_key: string | null;
  recurrence_start_month: number | null;
  recurrence_start_day: number | null;
  recurrence_end_month: number | null;
  recurrence_end_day: number | null;
  recurrence_end_is_month_end: boolean;
  calendar_item_categories: { category: string }[] | null;
  calendar_item_programs: { program_id: string }[] | null;
  content_opportunities:
    | (Omit<
        NonNullable<CalendarItemRow["content_opportunity"]>,
        "template_version" | "content_permission"
      > & {
        content_brief_template_versions: NonNullable<
          CalendarItemRow["content_opportunity"]
        >["template_version"];
        content_permissions: NonNullable<
          CalendarItemRow["content_opportunity"]
        >["content_permission"];
      })
    | null;
};

export function mapCalendarItemRow(row: unknown): CalendarItemRow {
  const r = row as RawCalendarItemRow;
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
    source: r.source,
    region: r.region,
    exceptions: r.exceptions,
    is_sensitive_topic: r.is_sensitive_topic,
    tone_guidance: r.tone_guidance,
    sensitive_review_by: r.sensitive_review_by,
    sensitive_review_at: r.sensitive_review_at,
    series_key: r.series_key,
    recurrence_start_month: r.recurrence_start_month,
    recurrence_start_day: r.recurrence_start_day,
    recurrence_end_month: r.recurrence_end_month,
    recurrence_end_day: r.recurrence_end_day,
    recurrence_end_is_month_end: r.recurrence_end_is_month_end,
    categories: (r.calendar_item_categories ?? []).map((c) => c.category),
    program_ids: (r.calendar_item_programs ?? []).map((p) => p.program_id),
    content_opportunity: r.content_opportunities
      ? (() => {
          const {
            content_brief_template_versions,
            content_permissions,
            ...opportunity
          } = r.content_opportunities;
          return {
            ...opportunity,
            template_version: content_brief_template_versions,
            content_permission: content_permissions,
          };
        })()
      : null,
  };
}

/** One calendar item with its content opportunity, for the detail page. */
export async function getCalendarItem(
  supabase: SupabaseClient,
  itemId: string,
): Promise<{ item: CalendarItemRow | null; error: boolean }> {
  const { data, error } = await supabase
    .from("calendar_items")
    .select(CALENDAR_ITEM_WITH_CONTENT_OPPORTUNITY_SELECT)
    .eq("id", itemId)
    .maybeSingle();

  if (error) return { item: null, error: true };
  return { item: data ? mapCalendarItemRow(data) : null, error: false };
}

/**
 * All non-archived calendar items with their content opportunity, for the
 * work-queue view. Intentionally not inner-joined to content_opportunities:
 * the Tier-1-undecided warning applies at the calendar-item level whether or
 * not an opportunity has been created yet.
 */
export async function listWorkQueueItems(
  supabase: SupabaseClient,
): Promise<CalendarItemRow[]> {
  const { data: rows } = await supabase
    .from("calendar_items")
    .select(CALENDAR_ITEM_WITH_CONTENT_OPPORTUNITY_SELECT)
    .neq("calendar_status", "archived")
    .order("starts_at", { ascending: true });

  return (rows ?? []).map(mapCalendarItemRow);
}

/** A calendar_items row shaped for series generation: enough to both detect a coverage gap and act as the copy-from template for the next instance. */
export type SeriesCandidateItem = Pick<
  CalendarItemRow,
  | "id"
  | "title"
  | "item_type"
  | "starts_at"
  | "time_zone"
  | "summary"
  | "priority_tier"
  | "priority_rationale"
  | "calendar_status"
  | "recurrence_rule"
  | "source"
  | "region"
  | "is_sensitive_topic"
  | "tone_guidance"
  | "series_key"
  | "recurrence_start_month"
  | "recurrence_start_day"
  | "recurrence_end_month"
  | "recurrence_end_day"
  | "recurrence_end_is_month_end"
  | "categories"
  | "program_ids"
>;

type RawSeriesCandidateRow = Omit<
  SeriesCandidateItem,
  "categories" | "program_ids"
> & {
  calendar_item_categories: { category: string }[] | null;
  calendar_item_programs: { program_id: string }[] | null;
};

/**
 * Every Tier 1/2, non-archived, structured-recurrence calendar item, for
 * the coverage reminder and the "generate missing instances" action.
 */
export async function listSeriesCandidates(
  supabase: SupabaseClient,
): Promise<SeriesCandidateItem[]> {
  const { data: rows } = await supabase
    .from("calendar_items")
    .select(SERIES_CANDIDATE_SELECT)
    .not("series_key", "is", null)
    .in("priority_tier", [1, 2])
    .neq("calendar_status", "archived");

  return ((rows ?? []) as unknown as RawSeriesCandidateRow[]).map((r) => ({
    ...r,
    categories: (r.calendar_item_categories ?? []).map((c) => c.category),
    program_ids: (r.calendar_item_programs ?? []).map((p) => p.program_id),
  }));
}

/** Series with no instance dated in `targetYear`, each with its most-recent instance as the generation template. */
export async function getMissingCoverageSeriesForYear(
  supabase: SupabaseClient,
  targetYear: number,
): Promise<MissingCoverageSeries<SeriesCandidateItem>[]> {
  const candidates = await listSeriesCandidates(supabase);
  return findMissingCoverageSeries(candidates, targetYear);
}
