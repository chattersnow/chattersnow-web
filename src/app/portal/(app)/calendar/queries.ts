import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarItemRow } from "./calendar-shared";

export const CALENDAR_ITEM_WITH_CONTENT_OPPORTUNITY_SELECT = `id, title, item_type, starts_at, ends_at, time_zone, recurrence_rule, summary, priority_tier, priority_rationale, calendar_status, visibility, owner_id, decision, decision_note, source, region, exceptions, calendar_item_categories(category), calendar_item_programs(program_id), content_opportunities(id, calendar_item_id, content_status, skip_reason, chatter_connection, recommended_formats, recommended_action, outstanding_work, owner_id, reviewer_id, lead_time_days, publish_due_at, review_due_at, draft_due_at, status_changed_by, status_changed_at, template_id, template_version_id, template_field_values, content_brief_template_versions!content_opportunities_template_version_id_fkey(id, version, fields))`;

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
