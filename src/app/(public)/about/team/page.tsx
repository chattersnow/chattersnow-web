import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { resolvePhoto, TEAM_PHOTO_FIELD } from "@/lib/site-content";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Meet the Team"),
  };
}

type TeamMember = {
  name: string;
  photo_url?: string;
  photo_slot?: string;
  bio?: string[];
};

export default async function TeamPage() {
  const supabase = await createSupabaseServerClient();
  const [siteImages, { content }] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
  ]);

  return (
    <div>
      <div className="w-fit">
        <div className="rainbow-accent w-full" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          {content.text("about_team.heading")}
        </h1>
      </div>

      <SiteImage
        url={siteImages.about_team_hero_photo ?? null}
        alt={content.text("org.image_alt")}
        className="mt-6 aspect-[21/9] rounded-2xl"
      />

      <div className="mt-8 grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {content.list<TeamMember>("about_team.members").map((member) => (
          <Card key={member.name}>
            <CardHeader>
              <SiteImage
                // The same call the editor's photo control makes, so what an
                // administrator was shown is what this renders (#922).
                url={resolvePhoto(TEAM_PHOTO_FIELD, member, siteImages).url}
                alt={member.name}
                icon={UserRound}
              />
            </CardHeader>
            <CardContent>
              <CardTitle>{member.name}</CardTitle>
              <div className="app-muted mt-2 space-y-3 text-sm leading-relaxed sm:text-base">
                {member.bio && member.bio.length > 0 ? (
                  member.bio.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))
                ) : (
                  <p>{content.text("about_team.bio_placeholder")}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
