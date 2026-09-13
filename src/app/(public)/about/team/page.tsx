import type { Metadata } from "next";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { getSiteLayout } from "@/lib/site-layout";
import { listPublicTeam } from "./team-data";
import { TeamMembers, type TeamMember } from "./team-members";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Meet the Team"),
  };
}

export default async function TeamPage() {
  const supabase = await createSupabaseServerClient();
  // All three reads are `cache()`-wrapped and none depends on another, so the
  // layout setting costs no round trip the page was not already making.
  const [siteImages, { content }, layout] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
    getSiteLayout(supabase),
  ]);

  // Copy or the tenant's own people (#1014): the same branch the Programs
  // page makes. Both sources arrive as TeamMember, so the arrangements below
  // never know which one they are rendering.
  const peopleMode = layout.teamSource === "people";
  const members: TeamMember[] = peopleMode
    ? await listPublicTeam(supabase)
    : content.list<TeamMember>("about_team.members");

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

      {/* Only People mode can be empty: the copy's registry default has one
          member, so a tenant on Site Content always has something to show. */}
      {peopleMode && members.length === 0 ? (
        <p className="app-muted mt-10 text-sm leading-relaxed sm:text-base">
          {content.text("about_team.empty")}
        </p>
      ) : (
        <TeamMembers
          members={members}
          siteImages={siteImages}
          layout={layout.teamLayout}
          bioPlaceholder={content.text("about_team.bio_placeholder")}
        />
      )}
    </div>
  );
}
