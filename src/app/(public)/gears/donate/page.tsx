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
  return { title: publicTitle(await getPublicSite(supabase), "Donate Gear") };
}

export default async function DonateGearPage() {
  const supabase = await createSupabaseServerClient();
  const [siteImages, { content }] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
  ]);

  return (
    <div className="space-y-12">
      <section id="how-it-works">
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.text("gears.donate_heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("gears.donate_intro")}
        </p>
      </section>

      <section id="request">
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {content.text("gears.request_heading")}
        </h2>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("gears.request_body")}
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          nativeButton={false}
          render={<Link href="/contact?topic=gear" />}
        >
          Contact us
        </Button>
      </section>

      <section id="donate">
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {content.text("gears.accept_heading")}
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3 sm:items-start">
          <SiteImage
            url={siteImages.gears_donate_photo ?? null}
            alt="Donated ski and snowboard gear"
            className="aspect-square rounded-xl"
          />
          <Card className="rainbow-surface sm:col-span-2">
            <CardHeader>
              <CardTitle>{content.text("gears.accept_title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="app-muted list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {content
                  .list<{ text: string }>("gears.accept_items")
                  .map((item) => (
                    <li key={item.text}>{item.text}</li>
                  ))}
              </ul>
              <p className="app-muted text-sm leading-relaxed">
                {content.text("gears.dropoff_body")}
              </p>
              <Button
                nativeButton={false}
                render={<Link href="/contact?topic=gear" />}
              >
                Contact us to donate gear
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="gear-drives">
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {content.text("gears.drives_heading")}
        </h2>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("gears.drives_body")}{" "}
          <Link
            href="/events"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Events
          </Link>{" "}
          for what&apos;s coming up.
        </p>
      </section>

      <section>
        <SiteImage
          url={siteImages.gears_donate_bottom_photo ?? null}
          alt={content.text("org.image_alt")}
          className="aspect-[16/9] rounded-2xl"
        />
      </section>
    </div>
  );
}
