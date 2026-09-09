import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { isPageVisible } from "@/lib/page-visibility";
import { getPublicSite, publicTitle } from "@/lib/public-site";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return {
    title: publicTitle(await getPublicSite(supabase), "Become a Partner"),
  };
}

export default async function PartnerPage() {
  const supabase = await createSupabaseServerClient();
  const [siteImages, { content, name }, brandVisible] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
    // Gated rather than linked unconditionally: /brand is hidden by default,
    // and an in-page CTA into a hidden section 404s the reader.
    isPageVisible("brand"),
  ]);

  return (
    <div>
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.text("get_involved.partner_heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("get_involved.partner_body")}
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          nativeButton={false}
          render={<Link href="/contact?topic=partnership" />}
        >
          Start a conversation
        </Button>
        {brandVisible && (
          <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed">
            Producing something that carries our name? Our{" "}
            <Link
              href="/brand"
              className="underline underline-offset-4 hover:text-foreground"
            >
              brand and design guide
            </Link>{" "}
            has the colours, the logo and how to use them.
          </p>
        )}
        <SiteImage
          url={siteImages.get_involved_partner_photo ?? null}
          alt={`${name} partnership`}
          className="mt-8 aspect-[21/9] rounded-2xl"
        />
      </section>
    </div>
  );
}
