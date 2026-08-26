export type AgendaTemplateSection = {
  key: string;
  label: string;
  topics: string[];
};

export type AgendaTemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  current_version_id: string | null;
};

export type AgendaTemplateVersionRow = {
  id: string;
  template_id: string;
  version: number;
  sections: AgendaTemplateSection[];
  created_at: string;
  created_by: string | null;
};

/** A template resolved together with its current version's sections, for the agenda form. */
export type ActiveAgendaTemplate = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  version_id: string;
  version: number;
  sections: AgendaTemplateSection[];
};

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export function isValidSectionKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}
