import type { Metadata } from "next";
import { detailTitle } from "@/lib/portal/detail-title";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { TEMPLATE_ROW_SELECT, mapTemplateRow } from "../template-shared";
import { TemplateDetailView } from "./template-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ templateId: string }>;
}): Promise<Metadata> {
  const { templateId } = await params;
  return {
    title: await detailTitle({
      table: "content_brief_templates",
      column: "name",
      id: templateId,
      fallback: "Brief Template",
    }),
  };
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const supabase = await createSupabaseServerClient();
  const permissions = await requirePermission(
    supabase,
    "content_calendar",
    "manage",
    "Brief Templates",
  );
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
      <PortalBreadcrumbs current={template.name} />

      <TemplateDetailView template={template} canManage={canManage} />
    </>
  );
}
