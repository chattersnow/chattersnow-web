import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import type { TemplateListRow } from "../template-shared";
import { EditTemplateSheet } from "./edit-template-sheet";

export function TemplateDetailView({
  template,
  canManage,
}: {
  template: TemplateListRow;
  canManage: boolean;
}) {
  return (
    <>
      <div>
        <div className="w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {template.name}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
        <p className="app-muted mt-2 text-sm">
          Content brief template · v{template.version}
        </p>
      </div>

      {canManage && (
        <div className="rainbow-surface mt-6 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--line)] p-4 shadow-md">
          <EditTemplateSheet template={template} variant="details" />
          <EditTemplateSheet template={template} variant="fields" />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Template details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <ReadOnlyField label="Key" htmlFor="template-view-key">
                {template.key}
              </ReadOnlyField>
              <ReadOnlyField
                label="Description"
                htmlFor="template-view-description"
              >
                {template.description || "—"}
              </ReadOnlyField>
              <ReadOnlyField label="Active" htmlFor="template-view-active">
                {template.is_active ? "Yes" : "No"}
              </ReadOnlyField>
              <ReadOnlyField
                label="Requires consent before approval"
                htmlFor="template-view-requires-consent"
              >
                {template.requires_consent ? "Yes" : "No"}
              </ReadOnlyField>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="app-muted text-sm font-semibold">
              Current fields (v{template.version})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul id="template-view-fields" className="flex flex-col gap-2">
              {template.fields.map((field) => (
                <li key={field.key} className="text-sm text-foreground">
                  {field.label}
                  {field.help_text && (
                    <span className="app-muted"> — {field.help_text}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
