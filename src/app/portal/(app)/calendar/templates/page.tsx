import Link from "next/link";
import { Eye } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NewTemplateDialog } from "./new-template-dialog";
import { TEMPLATE_ROW_SELECT, mapTemplateRow } from "./template-shared";

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
      <div className="rainbow-accent w-16" />
      <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Brief templates
      </h1>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Starter structures staff can pick when writing a content brief.
        Templates prefill structure only — they never publish content, and
        revising a template&apos;s fields never changes a brief already built
        from an earlier version.
      </p>

      <div className="mt-6 flex justify-end">
        {canManage ? <NewTemplateDialog /> : null}
      </div>

      <Card className="mt-6">
        <CardContent className="px-0">
          {error ? (
            <p className="app-muted px-4 py-6 text-sm">
              Could not load templates. Please try again.
            </p>
          ) : templates.length === 0 ? (
            <p className="app-muted px-4 py-6 text-sm">No templates yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Requires consent</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell
                      className="max-w-xs truncate font-medium"
                      title={template.name}
                    >
                      {template.name}
                    </TableCell>
                    <TableCell className="app-muted">{template.key}</TableCell>
                    <TableCell>v{template.version}</TableCell>
                    <TableCell className="app-muted">
                      {template.is_active ? "Yes" : "No"}
                    </TableCell>
                    <TableCell className="app-muted">
                      {template.requires_consent ? "Yes" : "No"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        nativeButton={false}
                        aria-label={`View ${template.name}`}
                        render={
                          <Link
                            href={`/portal/calendar/templates/${template.id}`}
                          />
                        }
                      >
                        <Eye />
                      </Button>
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
