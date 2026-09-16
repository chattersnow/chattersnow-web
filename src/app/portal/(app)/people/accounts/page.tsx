import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PeopleDirectory } from "../people-directory";
import { ACCOUNTS_SEGMENT } from "../people-segments";
import { segmentMetadata } from "../segment-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return segmentMetadata(ACCOUNTS_SEGMENT);
}

/**
 * The one People segment that can be absent (#1193).
 *
 * `people/layout.tsx` guards the whole subtree on `people:view`, which is
 * correct for the other eight; this one needs `constituent_claims:view` on top,
 * and that permission carries the `constituent_accounts` module entitlement
 * with it (20260910010000). So a tenant that has not turned the constituent
 * area on has nobody who passes this.
 *
 * `notFound()` in the page rather than a second `layout.tsx`, following
 * `website/articles/packs/page.tsx`: the route's *existence* is conditional, so
 * a 404 says the truth, where `requirePermission`'s bounce to
 * `/portal/home?denied=People` would claim People is out of reach. It also
 * keeps `nav-guards.test.ts` honest, which reads guards out of layout files and
 * would otherwise see a chain the People nav link cannot satisfy.
 */
export default async function PeopleAccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  if (!hasPermission(permissions, "constituent_claims", "view")) notFound();

  return (
    <PeopleDirectory segment={ACCOUNTS_SEGMENT} searchParams={searchParams} />
  );
}
