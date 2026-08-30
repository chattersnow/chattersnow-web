import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listProgramsAction } from "../../programs/actions";
import { listCalendarOwnersAction } from "../actions";
import { listActiveContentBriefTemplatesAction } from "../templates/actions";
import { listActiveProgramSuggestionRulesAction } from "../program-suggestions/actions";
import { getCalendarItem } from "../queries";
import { CalendarItemDetailView } from "./calendar-item-detail-view";

export default async function CalendarItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "content_calendar", "manage");

  const { item, error } = await getCalendarItem(supabase, itemId);

  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this calendar item. Please try again.
        </CardContent>
      </Card>
    );
  }
  if (!item) notFound();

  const [
    ownersResult,
    programsResult,
    templatesResult,
    suggestionRulesResult,
    { data: leadTimeSetting },
  ] = await Promise.all([
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

  const owners = "data" in ownersResult ? ownersResult.data : [];
  const programs = "data" in programsResult ? programsResult.data : [];
  const activeTemplates = "data" in templatesResult ? templatesResult.data : [];
  const programSuggestionRules =
    "data" in suggestionRulesResult ? suggestionRulesResult.data : [];
  const defaultLeadTimeDays =
    typeof leadTimeSetting?.value === "number" ? leadTimeSetting.value : 21;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="mb-2"
        render={<Link href="/portal/calendar" />}
      >
        <ArrowLeft /> Calendar
      </Button>

      <CalendarItemDetailView
        item={item}
        owners={owners}
        programs={programs}
        activeTemplates={activeTemplates}
        defaultLeadTimeDays={defaultLeadTimeDays}
        programSuggestionRules={programSuggestionRules}
        canManage={canManage}
      />
    </>
  );
}
