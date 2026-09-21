import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gatesHolding, LEGAL_DOCUMENTS } from "@/lib/legal-documents";
import {
  getLegalDocumentDrift,
  getTenantLegalPublication,
  getTenantOwnLegalDocuments,
} from "@/lib/legal-publication";
import { getTenantModules } from "@/lib/page-visibility";
import {
  LegalDocumentsPanel,
  type LegalDocumentStatus,
} from "../legal-documents-panel";

export const metadata: Metadata = {
  title: "Legal documents",
};

/**
 * Was System Settings' `?tab=legal` until #990.
 *
 * The lowest-conviction of the three moves, and recorded as such: adoption is
 * not authoring, which was the argument for leaving it in Administration. It
 * moves because the adoption switch and the text it publishes already
 * cross-linked in both directions -- they are two halves of one job, and one
 * section makes that job whole. If it reads badly in use, this is the one to
 * put back.
 */
export default async function WebsiteLegalDocumentsPage() {
  const supabase = await createSupabaseServerClient();
  const [legalPublication, modules, ownLegalSlots, drift] = await Promise.all([
    getTenantLegalPublication(supabase),
    // Which modules are on, so a document something depends on shows why it
    // cannot be withdrawn rather than offering a switch that will refuse
    // (#1295) -- the same stance `notifications.from_address` takes on an
    // unverified domain.
    getTenantModules(supabase),
    // Which of the three this tenant has published text of its own for, so the
    // panel can say what each route is actually serving rather than only
    // whether it is served (#859).
    getTenantOwnLegalDocuments(supabase),
    // And whether that text still describes what the site collects (#1292).
    // Every read behind this is `cache()`d, so the three it shares with the
    // ones above cost nothing twice.
    getLegalDocumentDrift(supabase),
  ]);

  const legalStatuses: LegalDocumentStatus[] = LEGAL_DOCUMENTS.map(
    (document) => ({
      key: document.key,
      inForce: Boolean(legalPublication[document.key]),
      ownDocument: ownLegalSlots.has(document.slotKey),
      heldInForceBy: gatesHolding(document, modules)[0]?.refuseWithdrawing,
      drift: drift[document.key],
    }),
  );

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Legal documents
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 space-y-4">
        <p className="app-muted max-w-3xl text-sm leading-relaxed">
          Which of the three legal documents this organization serves on its
          public site. This is not a show/hide control: putting one in force is
          saying the text is yours and governs using your site, so a document
          nobody has adopted stays off rather than being published under your
          name. The privacy policy is always served &mdash; the site collects
          personal information through its public forms, and a policy saying
          what happens to it has to be reachable while it does. Write or replace
          the text itself in{" "}
          <Link
            href="/portal/website?page=legal"
            className="underline underline-offset-4"
          >
            Pages
          </Link>
          . Every change here is recorded in the audit log.
        </p>
        <LegalDocumentsPanel
          documents={LEGAL_DOCUMENTS}
          statuses={legalStatuses}
        />
      </div>
    </>
  );
}
