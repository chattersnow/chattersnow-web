import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { instagramUrl } from "@/components/instagram-link";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Attend") };
}

export default async function AttendPage() {
  const supabase = await createSupabaseServerClient();
  const [siteImages, { content }] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
  ]);
  const imageAlt = content.text("org.image_alt");
  const instagramHandle = content.text("org.instagram_handle");

  return (
    <div className="space-y-12">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.text("get_involved.heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("get_involved.intro")}
        </p>
      </section>
      <section>
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {content.text("get_involved.attend_heading")}
        </h2>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("get_involved.attend_body")}
        </p>
        <Button
          className="mt-4"
          nativeButton={false}
          render={<Link href="/events" />}
        >
          See upcoming events
        </Button>
      </section>

      <section className="grid grid-cols-2 gap-6">
        <SiteImage
          url={siteImages.get_involved_attend_photo ?? null}
          alt={imageAlt}
          className="aspect-[4/3] rounded-2xl"
        />
        <SiteImage
          url={siteImages.get_involved_community_photo ?? null}
          alt={imageAlt}
          className="aspect-[4/3] rounded-2xl"
        />
      </section>

      {instagramHandle && (
        <section id="community">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            {content.text("get_involved.community_heading")}
          </h2>
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
            {content.text("get_involved.community_body")}{" "}
            <a
              href={instagramUrl(instagramHandle)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              @{instagramHandle}
            </a>
            .
          </p>
        </section>
      )}
    </div>
  );
}
