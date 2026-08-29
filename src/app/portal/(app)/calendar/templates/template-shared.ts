import type { TemplateField } from "../content-brief-template-shared";

export type TemplateListRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  requires_consent: boolean;
  version: number;
  fields: TemplateField[];
};

// Shape returned by selecting content_brief_templates with the
// current-version join (see TEMPLATE_ROW_SELECT).
type TemplateQueryRow = {
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

export const TEMPLATE_ROW_SELECT =
  "id, key, name, description, is_active, requires_consent, content_brief_template_versions!content_brief_templates_current_version_id_fkey(version, fields)";

// Returns null for a template with no published current version — those are
// still being created and aren't listable or viewable yet.
export function mapTemplateRow(row: unknown): TemplateListRow | null {
  const r = row as TemplateQueryRow;
  if (!r.content_brief_template_versions) return null;
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    is_active: r.is_active,
    requires_consent: r.requires_consent,
    version: r.content_brief_template_versions.version,
    fields: r.content_brief_template_versions.fields,
  };
}
