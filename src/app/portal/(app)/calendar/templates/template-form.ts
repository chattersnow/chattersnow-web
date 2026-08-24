import type { ParseResult } from "@/lib/forms";
import {
  isValidFieldKey,
  type TemplateField,
} from "../content-brief-template-shared";

export type TemplateFormData = {
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export function parseTemplateForm(
  formData: FormData,
): ParseResult<TemplateFormData> {
  const key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const isActive = String(formData.get("isActive") ?? "true") === "true";

  if (!key) return { error: "Template key is required." };
  if (!isValidFieldKey(key)) {
    return {
      error:
        "Template key must be lowercase letters, numbers, and underscores, starting with a letter.",
    };
  }
  if (!name) return { error: "Template name is required." };

  return { data: { key, name, description: description || null, isActive } };
}

export function parseTemplateFieldsForm(
  formData: FormData,
): ParseResult<TemplateField[]> {
  const raw = String(formData.get("fields") ?? "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "Could not read the field list. Please try again." };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: "A template needs at least one field." };
  }

  const fields: TemplateField[] = [];
  const seenKeys = new Set<string>();

  for (let index = 0; index < parsed.length; index++) {
    const raw = parsed[index] as Record<string, unknown>;
    const key = String(raw?.key ?? "").trim();
    const label = String(raw?.label ?? "").trim();
    const helpTextRaw = String(raw?.help_text ?? "").trim();

    if (!key || !isValidFieldKey(key)) {
      return {
        error: `Field ${index + 1}: key must be lowercase letters, numbers, and underscores, starting with a letter.`,
      };
    }
    if (!label) {
      return { error: `Field ${index + 1}: label is required.` };
    }
    if (seenKeys.has(key)) {
      return { error: `Field key "${key}" is used more than once.` };
    }
    seenKeys.add(key);

    fields.push({ key, label, help_text: helpTextRaw || null });
  }

  return { data: fields };
}
