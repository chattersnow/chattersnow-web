import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { isPageVisible } from "@/lib/page-visibility";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Get Involved") };
}

export default async function GetInvolvedPage() {
  const supabase = await createSupabaseServerClient();
  const [siteImages, { content }] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
  ]);
  const supportVisible = await isPageVisible("support");
  const imageAlt = content.text("org.image_alt");

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SiteImage
          url={siteImages.get_involved_hero_1 ?? null}
          alt={imageAlt}
          className="col-span-2 aspect-[2/1] rounded-2xl sm:aspect-[4/3]"
        />
        <SiteImage
          url={siteImages.get_involved_hero_2 ?? null}
          alt={imageAlt}
          className="aspect-square rounded-2xl"
        />
        <SiteImage
          url={siteImages.get_involved_hero_3 ?? null}
          alt={imageAlt}
          className="aspect-square rounded-2xl"
        />
      </div>

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

      <section className="grid gap-4 sm:grid-cols-3">
        <Button
          nativeButton={false}
          render={<Link href="/get-involved/attend" />}
        >
          {content.text("get_involved.attend_heading")}
        </Button>
        <Button
          nativeButton={false}
          render={<Link href="/get-involved/volunteer" />}
        >
          {content.text("get_involved.volunteer_heading")}
        </Button>
        <Button
          nativeButton={false}
          render={<Link href="/get-involved/partner" />}
        >
          {content.text("get_involved.partner_heading")}
        </Button>
      </section>

      <section>
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {content.text("get_involved.sponsor_heading")}
        </h2>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("get_involved.sponsor_body")}
          {supportVisible ? (
            <>
              {" "}
              See sponsorship details on our{" "}
              <Link
                href="/support#sponsorship"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Support page
              </Link>
              .
            </>
          ) : null}
        </p>
      </section>

      <section>
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          {content.text("get_involved.gear_heading")}
        </h2>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("get_involved.gear_body")}{" "}
          <Link
            href="/inventory/donate#donate"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Gear page
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
