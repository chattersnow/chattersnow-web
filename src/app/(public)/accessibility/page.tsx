import type { Metadata } from "next";
import {
  LegalDocumentPage,
  legalDocumentMetadata,
} from "@/components/legal-document-page";

const SLOT = "legal.accessibility";
const FALLBACK_TITLE = "Accessibility";

// The platform's neutral document renders unless the tenant has published its
// own under `legal.accessibility`, in which case that replaces the page outright --
// legal text is published per organization, not templated (#858). `?version=N`
// serves a published version from its frozen snapshot (#601); everything the
// four pages share lives in `LegalDocumentPage`.
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
