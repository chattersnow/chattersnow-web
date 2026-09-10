import { cache } from "react";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEGAL_DOCUMENTS,
  LEGAL_PUBLICATION_PREFIX,
  resolveInForce,
  type LegalDocument,
} from "@/lib/legal-documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Which legal documents this tenant serves (#859).
 *
 * The registry and the reasoning are in `@/lib/legal-documents.ts`; this is the
 * read, kept separate because that module reaches the client bundle and this
 * one must not. Same split as `@/lib/page-visibility`, and the same storage:
 * one `app_settings` row per document, exposed to the public site through the
 * `public_legal_publication` view.
 */
export type LegalPublication = Record<string, boolean>;

export const getLegalPublication = cache(
  async (supabase: SupabaseClient): Promise<LegalPublication> => {
    const { data, error } = await supabase
      .from("public_legal_publication")
      .select("document, value");

    // A failed read lands on "not in force", which is where an unreadable flag
    // has to land: serving terms nobody adopted under an organization's name is
    // the failure this gate exists to prevent. The privacy policy is unaffected
    // -- `resolveInForce` serves it whatever comes back -- so a broken read
    // cannot take down the one page that must never 404. Loud, though: a view
    // missing from a database looked exactly like a toggle refusing to save
    // when page visibility hit it.
    if (error) {
      console.error(
        "[legal-publication] could not read public_legal_publication; only the privacy policy is being served",
        error,
      );
    }

    const inForce: LegalPublication = {};
    for (const document of LEGAL_DOCUMENTS) {
      const row = data?.find((setting) => setting.document === document.key);
      inForce[document.key] = resolveInForce(document, row?.value);
    }
    return inForce;
  },
);

/**
 * The same state for the tenant the signed-in admin has selected, for the
 * System Settings panel. Read straight from `app_settings` -- RLS scopes it to
 * the current tenant -- rather than through `public_legal_publication`, which
 * answers for the *request host*. Same split as `getTenantLayoutValues` and
 * `getSiteLayout`, and for the same reason.
 *
 * Reading the public view here is what made the switch snap back (#859): the
 * write goes to `app_settings` with `tenant_id` defaulting to
 * `default_tenant_id()`, which is the admin's own tenant, while the panel read
 * came back for whichever tenant `public_tenant_id()` resolves `portal.<domain>`
 * to -- a different tenant, or none at all once a second tenant is active and
 * the sole-active-tenant fallback switches off. The row was written, the toast
 * was honest, and the re-render showed the document as never adopted.
 */
export const getTenantLegalPublication = cache(
  async (supabase: SupabaseClient): Promise<LegalPublication> => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .like("key", `${LEGAL_PUBLICATION_PREFIX}%`);

    // Same reasoning as the read above, and the same refusal to be quiet about
    // it: "not in force" is where an unreadable flag has to land, but a silent
    // fallback is indistinguishable from a toggle that will not save.
    if (error) {
      console.error(
        "[legal-publication] could not read legal_publication.* from app_settings; the panel is showing every document as not in force",
        error,
      );
    }

    const stored = new Map(
      (data ?? []).map((row) => [
        String(row.key).slice(LEGAL_PUBLICATION_PREFIX.length),
        row.value,
      ]),
    );

    const inForce: LegalPublication = {};
    for (const document of LEGAL_DOCUMENTS) {
      inForce[document.key] = resolveInForce(
        document,
        stored.get(document.key),
      );
    }
    return inForce;
  },
);

/** The documents this tenant serves, in registry order, for the footer. */
export function documentsInForce(
  publication: LegalPublication,
): LegalDocument[] {
  return LEGAL_DOCUMENTS.filter((document) => publication[document.key]);
}

/**
 * Route gate, called at the top of a document's layout.
 *
 * Dropping the footer link alone would leave text nobody adopted at a guessable
 * URL, which is the outcome the gate exists to prevent, so the route 404s too.
 */
export async function requireLegalDocumentInForce(key: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const publication = await getLegalPublication(supabase);
  if (!publication[key]) notFound();
}
