import type { Metadata } from "next";
import {
  LegalDocumentPage,
  legalDocumentMetadata,
} from "@/components/legal-document-page";

const SLOT = "legal.waiver";
const FALLBACK_TITLE = "Participant Waiver";

// The one legal page with no platform document behind it (#686). Where the
// other three serve neutral text until a tenant writes its own, this serves
// the tenant's text or nothing at all: a release of legal rights is not
// something the software can assert on an organization's behalf.
//
// So `FALLBACK_TITLE` is a title for a page that will not render -- it exists
// because `legalDocumentMetadata` needs one before it knows there is no
// document, and the page 404s a moment later.
//
// `?version=N` serves a published version from its frozen snapshot (#601),
// which is what a registration's `waiver_version` points at.
type PageProps = {
  searchParams: Promise<{ version?: string }>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const { version } = await searchParams;
  return legalDocumentMetadata({
    slotKey: SLOT,
    fallbackTitle: FALLBACK_TITLE,
    requestedVersion: version,
  });
}

export default async function Page({ searchParams }: PageProps) {
  const { version } = await searchParams;
  return (
    <LegalDocumentPage
      slotKey={SLOT}
      fallbackTitle={FALLBACK_TITLE}
      requestedVersion={version}
    />
  );
}
