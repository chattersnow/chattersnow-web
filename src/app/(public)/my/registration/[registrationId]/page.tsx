import type { Metadata } from "next";
import { ClaimHandoff } from "@/app/(public)/my/claim-handoff";
import { requireConstituentSession } from "@/lib/constituent/guard";
import { myRegistrationClaimPath } from "@/lib/constituent/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { PhotoConsentCard } from "./photo-consent-card";

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

  const supabase = await createSupabaseServerClient();

  // #599, reversed by #1376. The one thing on this page that is theirs to
  // change rather than to read: asking not to be photographed. It is the
  // self-service one of the three routes the registration form names, and the
  // narrowest -- the other two, an organizer and email, reach everybody, and
  // this one reaches only somebody who has claimed an account.
  //
  // Read through `my_photo_consent()`, which resolves the person itself, so an
  // id belonging to somebody else returns no rows and renders nothing. That is
  // the same silence `ClaimHandoff` keeps above: a page that said "not yours"
  // would be a way to test ids.
  //
  // `asked` is whether the organization publishes a photo notice *now* -- that
  // is, whether there is anything to object to. It is computed from the
  // tenant's slot alone, with no reference to this row's own columns, so the
  // control appears for every registrant of a tenant that publishes one,
  // including the overwhelming majority whose columns are null. The paragraphs
  // come from the live slot for the same reason: somebody objecting is
  // objecting to today's words, which is what the RPC snapshots.
  const { data: photoRows } = await supabase.rpc("my_photo_consent", {
    p_registration_id: registrationId,
  });
  const photo = photoRows?.[0] ?? null;
  const { content } = await getPublicSite(supabase);

  return (
    <ClaimHandoff
      title="Your registration"
      lede="You're registered either way — this only decides whether it ends up on your account."
      record={{ kind: "registration", id: registrationId }}
      personId={personId}
      after={
        photo?.asked ? (
          <PhotoConsentCard
            registrationId={registrationId}
            paragraphs={content.paragraphs("events.photo_consent")}
            consent={photo.consent}
          />
        ) : null
      }
    />
  );
}
