import type { Metadata } from "next";
import { applyLexicon } from "@/lib/lexicon";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPortalVocabulary } from "@/lib/tenant-person-roles";
import type { PeopleSegment } from "./people-segments";

/**
 * A segment page's browser title, in the tenant's own words (#911).
 *
 * The eight segment pages each carried a static `metadata` object repeating the
 * segment's title as a literal, which is one more place the word "Donors" was
 * written down. `generateMetadata` costs nothing extra here: the vocabulary is
 * request-cached and the page body reads it anyway.
 *
 * Its own module rather than `people-segments.ts` so that file stays free of
 * server-only imports -- it is the one the unit tests and the registry
 * consumers read.
 */
export async function segmentMetadata(
  segment: PeopleSegment,
): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: applyLexicon(segment.title, await getPortalVocabulary(supabase)),
  };
}
