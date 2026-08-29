import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewSuggestionRuleDialog } from "./new-suggestion-rule-dialog";
import {
  SuggestionRuleDetailsSheet,
  type SuggestionRuleListRow,
} from "./suggestion-rule-details-sheet";
import { listProgramsAction } from "../../programs/actions";
import { CATEGORIES, ITEM_TYPES, labelFor } from "../calendar-shared";

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
  const programName = (programId: string) =>
    programs.find((program) => program.id === programId)?.name ?? "—";

  return (
    <>
      <div className="rainbow-accent w-16" />
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Program suggestions
      </h1>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Rules mapping a calendar item&apos;s type and/or category to a suggested
        program. Suggestions appear as dismissible chips in the item editor —
        staff still choose whether to add the program, so nothing here assigns a
        program automatically.
      </p>

      <div className="mt-6 flex justify-end">
        {canManage ? <NewSuggestionRuleDialog programs={programs} /> : null}
      </div>

      <Card className="mt-6">
        <CardContent className="px-0">
          {error ? (
            <p className="app-muted px-4 py-6 text-sm">
              Could not load suggestion rules. Please try again.
            </p>
          ) : rules.length === 0 ? (
            <p className="app-muted px-4 py-6 text-sm">No rules yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="app-muted">
                      {rule.item_type
                        ? labelFor(ITEM_TYPES, rule.item_type)
                        : "Any"}
                    </TableCell>
                    <TableCell className="app-muted">
                      {rule.category
                        ? labelFor(CATEGORIES, rule.category)
                        : "Any"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {programName(rule.program_id)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate app-muted">
                      {rule.note || "—"}
                    </TableCell>
                    <TableCell className="app-muted">
                      {rule.is_active ? "Yes" : "No"}
                    </TableCell>
                    <TableCell className="text-right">
                      <SuggestionRuleDetailsSheet
                        rule={rule}
                        programs={programs}
                        canManage={canManage}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
