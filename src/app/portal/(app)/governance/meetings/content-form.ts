import type { ParseResult } from "@/lib/forms";

export type ContentFormData = {
  external_link: string | null;
  body_text: string | null;
};

// Shared by governance records that are a single flexible-content blob
// (external link and/or free text; file uploads are out of scope, see
// docs/technical-spec.md §6 and issue #34) -- resolutions, bylaws, policies,
// annual requirements, and conflict-of-interest disclosures. Agendas moved to
// the structured template form in agenda-form.ts (issue #166); minutes were
// dropped in favor of Agenda's notes field (issue #408).
export function parseContentForm(
  formData: FormData,
): ParseResult<ContentFormData> {
  const externalLink = String(formData.get("externalLink") ?? "").trim();
  const bodyText = String(formData.get("bodyText") ?? "").trim();

  return {
    data: {
      external_link: externalLink || null,
      body_text: bodyText || null,
    },
  };
}
