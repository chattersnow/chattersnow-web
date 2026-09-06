import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { DESCRIPTION, CodeOfConductDocument } from "./document";

// The platform's own document renders unless the tenant has published its
// own under `legal.code_of_conduct` (#707 Phase 4), in which case that replaces the page
// outright -- legal text is published per organization, not templated.
export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  const doc = site.content.document("legal.code_of_conduct");
  return {
    title: publicTitle(site, doc?.title ?? "Code of Conduct"),
    description: doc ? undefined : DESCRIPTION,
  };
}

export default async function Page() {
  const supabase = await createSupabaseServerClient();
  const { content } = await getPublicSite(supabase);
  const doc = content.document("legal.code_of_conduct");
  return doc ? <LegalDocument doc={doc} /> : <CodeOfConductDocument />;
}
