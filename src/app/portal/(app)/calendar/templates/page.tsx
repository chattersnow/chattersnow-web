import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { NewTemplateDialog } from "./new-template-dialog";
import { TemplatesTable } from "./templates-table";
import { TEMPLATE_ROW_SELECT, mapTemplateRow } from "./template-shared";

export const metadata: Metadata = {
  title: "Brief Templates",
};

export default async function ContentBriefTemplatesPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "content_calendar", "manage");

  const { data: rows, error } = await supabase
    .from("content_brief_templates")
    .select(TEMPLATE_ROW_SELECT)
    .order("name", { ascending: true });

  const templates = (rows ?? []).flatMap((row) => {
    const template = mapTemplateRow(row);
    return template ? [template] : [];
  });

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Brief Templates
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Starter structures staff can pick when writing a content brief.
        Templates prefill structure only — they never publish content, and
        revising a template&apos;s fields never changes a brief already built
        from an earlier version.
      </p>

      <div className="mt-6">
        {error ? (
          <Card>
            <CardContent className="px-0">
              <p className="app-muted px-4 py-6 text-sm">
                Could not load templates. Please try again.
              </p>
            </CardContent>
          </Card>
        ) : (
          <TemplatesTable
            templates={templates}
            newAction={canManage ? <NewTemplateDialog /> : undefined}
          />
        )}
      </div>
    </>
  );
}
