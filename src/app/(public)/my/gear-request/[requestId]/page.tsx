import type { Metadata } from "next";
import { ClaimHandoff } from "@/app/(public)/my/claim-handoff";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { myGearRequestClaimPath } from "@/lib/constituent/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Your request"),
    // One person's record. Nothing under /my is worth finding in a search
    // result, and the area carries no robots.ts to say so for it.
    robots: { index: false, follow: false },
  };
}

/** Where the gear-request sign-up hand-off lands (#1359). See `ClaimHandoff`. */
export default async function MyGearRequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const { personId } = await requireConstituentSession(
    myGearRequestClaimPath(requestId),
  );

  return (
    <ClaimHandoff
      title="Your request"
      lede="Your items are held either way — this only decides whether the request ends up on your account."
      record={{ kind: "gear-request", id: requestId }}
      personId={personId}
    />
  );
}
