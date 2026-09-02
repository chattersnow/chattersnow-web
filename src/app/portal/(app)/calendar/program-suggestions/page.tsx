import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { NewSuggestionRuleDialog } from "./new-suggestion-rule-dialog";
import type { SuggestionRuleListRow } from "./suggestion-rule-details-sheet";
import { SuggestionRulesTable } from "./suggestion-rules-table";
import { listProgramsAction } from "../../programs/actions";

export default async function ProgramSuggestionRulesPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "content_calendar", "manage");

  const { data: rows, error } = await supabase
    .from("calendar_program_suggestion_rules")
    .select("id, item_type, category, program_id, note, is_active")
    .order("created_at", { ascending: true });

  const rules: SuggestionRuleListRow[] = rows ?? [];

  const programsResult = await listProgramsAction();
  const programs = "data" in programsResult ? programsResult.data : [];

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Program suggestions
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Rules mapping a calendar item&apos;s type and/or category to a suggested
        program. Suggestions appear as dismissible chips in the item editor —
        staff still choose whether to add the program, so nothing here assigns a
        program automatically.
      </p>

      <div className="mt-6">
        {error ? (
          <Card>
            <CardContent className="px-0">
              <p className="app-muted px-4 py-6 text-sm">
                Could not load suggestion rules. Please try again.
              </p>
            </CardContent>
          </Card>
        ) : (
          <SuggestionRulesTable
            rules={rules}
            programs={programs}
            canManage={canManage}
            newAction={
              canManage ? (
                <NewSuggestionRuleDialog programs={programs} />
              ) : undefined
            }
          />
        )}
      </div>
    </>
  );
}
