import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Sponsorship") };
}

export default async function SponsorshipPage() {
  const supabase = await createSupabaseServerClient();
  const [siteImages, { content }] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
  ]);
  const imageAlt = content.text("org.image_alt");

  return (
    <div className="space-y-12">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.text("support.sponsorship_heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("support.sponsorship_intro")}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {content
          .list<{ name: string; description: string }>(
            "support.sponsorship_tiers",
          )
          .map((tier) => (
            <Card key={tier.name}>
              <CardHeader>
                <CardTitle>{tier.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="app-muted text-sm leading-relaxed">
                  {tier.description}
                </p>
              </CardContent>
            </Card>
          ))}
      </section>

      <Button
        variant="rainbow"
        nativeButton={false}
        render={<Link href="/contact?topic=partnership" />}
      >
        {content.text("support.sponsorship_cta")}
      </Button>

      <section className="grid gap-6 sm:grid-cols-2">
        <SiteImage
          url={siteImages.sponsorship_photo_1 ?? null}
          alt={imageAlt}
          className="aspect-[4/3] rounded-2xl"
        />
        <SiteImage
          url={siteImages.sponsorship_photo_2 ?? null}
          alt={imageAlt}
          className="aspect-[4/3] rounded-2xl"
        />
      </section>
    </div>
  );
}
