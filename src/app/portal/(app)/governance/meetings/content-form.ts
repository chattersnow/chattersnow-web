import type { ParseResult } from "@/lib/forms";
import { isDocumentPath } from "@/lib/storage/documents";

export type ContentFormData = {
  external_link: string | null;
  document_path: string | null;
  body_text: string | null;
};

// Shared by governance records that are a single flexible-content blob
// (a document -- a link or an uploaded file, #1489 -- and/or free text) --
// resolutions, bylaws, policies, annual requirements, and conflict-of-interest
// disclosures. Agendas moved to the structured template form in agenda-form.ts
// (issue #166), which reads its document through `parseDocumentFields` below;
// minutes were dropped in favor of Agenda's notes field (issue #408).
export function parseContentForm(
  formData: FormData,
): ParseResult<ContentFormData> {
  const document = parseDocumentFields(formData);
  if ("error" in document) return document;
  const bodyText = String(formData.get("bodyText") ?? "").trim();

  return {
    data: {
      ...document.data,
      body_text: bodyText || null,
    },
  };
}

/**
 * A governance record's document: `externalLink` or `documentPath`, never
 * both (the tables' `*_one_document` constraints say the same). The path must
 * look like one `createDocumentPathAction` minted; which tenant it sits under
 * is the database's check to make.
 */
export function parseDocumentFields(
  formData: FormData,
): ParseResult<Pick<ContentFormData, "external_link" | "document_path">> {
  const externalLink = String(formData.get("externalLink") ?? "").trim();
  const documentPath = String(formData.get("documentPath") ?? "").trim();

  if (externalLink && documentPath) {
    return { error: "Attach a link or a file, not both." };
  }
  if (documentPath && !isDocumentPath(documentPath, "governance")) {
    return { error: "That file could not be attached. Upload it again." };
  }

  return {
    data: {
      external_link: externalLink || null,
      document_path: documentPath || null,
    },
  };
}
