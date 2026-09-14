import { publicRead, unwrap } from "@/lib/api/handler";
import { LEGAL_DOCUMENTS, resolveInForce } from "@/lib/legal-documents";

/**
 * Which legal documents this organization has put in force (#859), and where
 * they are on its own site.
 *
 * The *bodies* are not here. They are still code defaults rather than data
 * (#600/#601), and a document served through a second surface under an
 * organization's name, out of step with the one its own site is serving, is
 * exactly the failure the publication model exists to prevent. A consumer that
 * needs the text links to `url` until those tickets land.
 */
const route = publicRead(async ({ supabase }) => {
  const rows = unwrap(
    await supabase.from("public_legal_publication").select("document, value"),
  );

  const stored = new Map((rows ?? []).map((row) => [row.document, row.value]));

  return {
    documents: LEGAL_DOCUMENTS.map((document) => ({
      key: document.key,
      label: document.label,
      url: document.route,
      in_force: resolveInForce(document, stored.get(document.key)),
    })),
  };
});

export const GET = route.GET;
export const OPTIONS = route.OPTIONS;
