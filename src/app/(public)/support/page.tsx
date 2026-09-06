import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  return { title: publicTitle(site, site.content.text("support.heading")) };
}

export default async function SupportPage() {
  const supabase = await createSupabaseServerClient();
  const { content } = await getPublicSite(supabase);

  return (
    <div className="space-y-12">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.text("support.heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("support.intro")}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <Link href="/support/donations" className="hover:underline">
                {content.text("support.donations_heading")}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              {content.text("support.donations_card")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <Link href="/support/sponsorship" className="hover:underline">
                {content.text("support.sponsorship_heading")}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="app-muted text-sm leading-relaxed">
              {content.text("support.sponsorship_card")}
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
