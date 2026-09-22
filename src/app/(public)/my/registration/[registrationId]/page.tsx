import type { Metadata } from "next";
import { ClaimHandoff } from "@/app/(public)/my/claim-handoff";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { myRegistrationClaimPath } from "@/lib/constituent/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Your registration"),
    // One person's record. Nothing under /my is worth finding in a search
    // result, and the area carries no robots.ts to say so for it.
    robots: { index: false, follow: false },
  };
}

/** Where the registration sign-up hand-off lands (#1258). See `ClaimHandoff`. */
export default async function MyRegistrationPage({
  params,
}: {
  params: Promise<{ registrationId: string }>;
}) {
  const { registrationId } = await params;
  const { personId } = await requireConstituentSession(
    myRegistrationClaimPath(registrationId),
  );

  return (
    <ClaimHandoff
      title="Your registration"
      lede="You're registered either way — this only decides whether it ends up on your account."
      record={{ kind: "registration", id: registrationId }}
      personId={personId}
    />
  );
}
