import type { Metadata } from "next";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Our Story") };
}

export default async function StoryPage() {
  const supabase = await createSupabaseServerClient();
  const [siteImages, { content }] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
  ]);

  return (
    <div>
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.text("about_story.heading")}
          </h1>
        </div>
        <div className="app-muted mt-4 max-w-3xl space-y-4 text-sm leading-relaxed sm:text-base">
          {content.paragraphs("about_story.intro").map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>
      <section className="mt-12 grid gap-8 sm:grid-cols-3 sm:items-start">
        <div className="sm:col-span-2">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            {content.text("about_story.section_heading")}
          </h2>
          <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
            {content.paragraphs("about_story.body").map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
        <SiteImage
          url={siteImages.about_story_photo ?? null}
          alt={content.text("org.image_alt")}
          className="aspect-[3/4] self-start rounded-xl sm:sticky sm:top-24"
        />
      </section>
    </div>
  );
}
