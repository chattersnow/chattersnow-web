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
import { TEMPLATE_ROW_SELECT, mapTemplateRow } from "../template-shared";
import { TemplateDetailView } from "./template-detail-view";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "content_calendar", "manage");

  const { data: row, error } = await supabase
    .from("content_brief_templates")
    .select(TEMPLATE_ROW_SELECT)
    .eq("id", templateId)
    .maybeSingle();

  if (error) {
    return (
      <Card>
        <CardContent className="app-muted text-sm">
          Could not load this template. Please try again.
        </CardContent>
      </Card>
    );
  }
  const template = row ? mapTemplateRow(row) : null;
  if (!template) notFound();

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        className="mb-2"
        render={<Link href="/portal/calendar/templates" />}
      >
        <ArrowLeft /> Brief templates
      </Button>

      <TemplateDetailView template={template} canManage={canManage} />
    </>
  );
}
