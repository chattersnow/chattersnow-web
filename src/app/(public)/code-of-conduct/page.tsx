import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import {
  platformLegalDescription,
  platformLegalDocument,
} from "@/lib/legal-defaults";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, legalOrg, publicTitle } from "@/lib/public-site";

const SLOT = "legal.code_of_conduct";

// The platform's neutral document renders unless the tenant has published its
// own under `legal.code_of_conduct`, in which case that replaces the page outright --
// legal text is published per organization, not templated (#858).
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  const doc = site.content.document(SLOT);
  return {
    title: publicTitle(site, doc?.title ?? "Code of Conduct"),
    description: doc
      ? undefined
      : platformLegalDescription(SLOT, legalOrg(site)),
  };
}

export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  const doc =
    site.content.document(SLOT) ?? platformLegalDocument(SLOT, legalOrg(site));
  return <LegalDocument doc={doc} />;
}
