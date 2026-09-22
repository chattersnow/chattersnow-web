import type { SupabaseClient } from "@supabase/supabase-js";
import { getLegalPublication } from "@/lib/legal-publication";
import { getPublishedLegalVersions } from "@/lib/legal-versions";
import { getPublicSite } from "@/lib/public-site";
import type { LegalDocumentContent } from "@/lib/site-content";

export type EventWaiverContent = {
  content: LegalDocumentContent;
  version: number;
};

/**
 * The participant agreement this tenant takes at registration, or null (#686).
 *
 * Null covers every tenant that has adopted no waiver, which is almost all of
 * them, and on that path this costs nothing: `getLegalPublication` is already
 * read on every public request for the footer's legal bar, and both reads
 * below are `cache()`d behind it.
 *
 * Three conditions, and all three are needed. The publication row says the
 * organization has adopted one; the site content row says it has written one,
 * which is what makes the route serve rather than 404; and a version row is
 * what a registration can actually point at. The portal refuses to create the
 * states where those disagree -- see `updateLegalPublicationAction` and
 * `publish_site_content()` -- so reaching them means a direct write, and the
 * honest answer to "adopted but unwritten" is to show nothing here and let
 * the RPC refuse the registration rather than take one against a document
 * that does not exist.
 *
 * The content returned is the *version's*, not the live slot's. The record
 * written points at a version number, so the words on screen have to be that
 * version's words; the live row is only the gate that says something was
 * published at all.
 */
export async function loadEventWaiver(
  supabase: SupabaseClient,
): Promise<EventWaiverContent | null> {
  const publication = await getLegalPublication(supabase);
  if (!publication.waiver) return null;

  const site = await getPublicSite(supabase);
  if (!site.content.document("legal.waiver")) return null;

  const versions = await getPublishedLegalVersions(supabase, "waiver");
  const inForce = versions[0];
  if (!inForce) return null;

  return { content: inForce.content, version: inForce.version };
}
