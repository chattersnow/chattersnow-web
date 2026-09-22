import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { getPublicGivingSettings } from "@/lib/public-giving";
import { givingIsPublished } from "@/lib/giving";
import { GiveCard } from "./give-card";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Donations") };
}

export default async function DonationsPage() {
  const supabase = await createSupabaseServerClient();
  const [siteImages, { content }, giving] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
    getPublicGivingSettings(supabase),
  ]);

  return (
    <div className="space-y-12">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl">
            {content.text("support.donations_heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("support.donations_intro")}
        </p>
      </section>

      {/* Above the monetary/in-kind grid, and absent entirely until a tenant
          has switched giving on: the ask comes first, and a tenant that has
          configured nothing gets exactly today's page back (#1389). */}
      {givingIsPublished(giving) ? (
        <section>
          <GiveCard
            settings={giving}
            title={content.text("support.giving_title")}
            body={content.text("support.giving_body")}
            taxNote={content.text("support.giving_tax_note")}
          />
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{content.text("support.monetary_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              {content.text("support.monetary_body")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{content.text("support.inkind_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              {content.text("support.inkind_body")}{" "}
              {/* The `donate` anchor is on the donate page; the section index
                  only redirects to the catalog, where the fragment matches
                  nothing. */}
              <Link
                href="/inventory/donate#donate"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Gear page
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <SiteImage
          url={siteImages.donations_photo ?? null}
          alt={content.text("org.image_alt")}
          className="aspect-[16/9] rounded-2xl"
        />
      </section>
    </div>
  );
}
