export type TemplateField = {
  key: string;
  label: string;
  help_text: string | null;
};

export type ContentBriefTemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  current_version_id: string | null;
};

export type ContentBriefTemplateVersionRow = {
  id: string;
  template_id: string;
  version: number;
  fields: TemplateField[];
  created_at: string;
  created_by: string | null;
};

/** A template resolved together with its current version's fields, for the brief picker. */
export type ActiveContentBriefTemplate = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  version_id: string;
  version: number;
  fields: TemplateField[];
};

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export function isValidFieldKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}
