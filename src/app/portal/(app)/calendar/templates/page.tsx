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
import { NewTemplateDialog } from "./new-template-dialog";
import {
  TemplateDetailsSheet,
  type TemplateListRow,
} from "./template-details-sheet";
import type { TemplateField } from "../content-brief-template-shared";

export default async function ContentBriefTemplatesPage() {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "content_calendar", "manage");

  const { data: rows, error } = await supabase
    .from("content_brief_templates")
    .select(
      "id, key, name, description, is_active, requires_consent, content_brief_template_versions!content_brief_templates_current_version_id_fkey(version, fields)",
    )
    .order("name", { ascending: true });

  const templates: TemplateListRow[] = (rows ?? []).flatMap((row) => {
    const r = row as unknown as {
      id: string;
      key: string;
      name: string;
      description: string | null;
      is_active: boolean;
      requires_consent: boolean;
      content_brief_template_versions: {
        version: number;
        fields: TemplateField[];
      } | null;
    };
    if (!r.content_brief_template_versions) return [];
    return [
      {
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        is_active: r.is_active,
        requires_consent: r.requires_consent,
        version: r.content_brief_template_versions.version,
        fields: r.content_brief_template_versions.fields,
      },
    ];
  });

  return (
    <>
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
                    <TableCell className="font-medium">
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
                      <TemplateDetailsSheet
                        template={template}
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
