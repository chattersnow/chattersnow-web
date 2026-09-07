import type { Metadata } from "next";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Mission & Values"),
  };
}

export default async function MissionPage() {
  const supabase = await createSupabaseServerClient();
  const [siteImages, { content }] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
  ]);
  const imageAlt = content.text("org.image_alt");

  return (
    <div className="space-y-12">
      <section
        id="mission"
        className="grid gap-8 sm:grid-cols-3 sm:items-start"
      >
        <div className="sm:col-span-2">
          <div className="w-fit">
            <div className="rainbow-accent w-full" />
            <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              {content.text("about_mission.heading")}
            </h1>
          </div>
          <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
            <p>&ldquo;{content.text("about_mission.statement")}&rdquo;</p>
            <p>{content.text("about_mission.lead_in")}</p>
          </div>
          <ul className="app-muted mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
            {content
              .list<{ text: string }>("about_mission.points")
              .map((point) => (
                <li key={point.text}>{point.text}</li>
              ))}
          </ul>
          <p className="app-muted mt-4 text-sm leading-relaxed sm:text-base">
            {content.text("about_mission.closing")}
          </p>
        </div>
        <SiteImage
          url={siteImages.about_mission_photo ?? null}
          alt={imageAlt}
          className="aspect-square rounded-2xl sm:sticky sm:top-24"
        />
      </section>

      <section id="values">
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {content.text("about_mission.values_heading")}
        </h2>
        <ul className="app-muted mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed sm:text-base">
          {content
            .list<{ name: string; description: string }>("about_mission.values")
            .map((value) => (
              <li key={value.name}>
                <span className="text-foreground font-medium">
                  {value.name}.
                </span>{" "}
                {value.description}
              </li>
            ))}
        </ul>
      </section>

      <section id="why-lgbtq">
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {content.text("about_mission.why_heading")}
        </h2>
        <div className="app-muted mt-4 max-w-3xl space-y-4 text-sm leading-relaxed sm:text-base">
          {content
            .paragraphs("about_mission.why_body")
            .map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
        </div>
      </section>

      <section id="mission-photo">
        <SiteImage
          url={siteImages.about_mission_bottom_photo ?? null}
          alt={imageAlt}
          className="aspect-[16/9] rounded-2xl"
        />
      </section>
    </div>
  );
}
