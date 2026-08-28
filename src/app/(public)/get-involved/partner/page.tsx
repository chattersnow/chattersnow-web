import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";

export const metadata: Metadata = {
  title: "Become a Partner | Chatter Snow",
};

export default async function PartnerPage() {
  const supabase = await createSupabaseServerClient();
  const siteImages = await getSiteImageUrls(supabase);

  return (
    <div>
      <section>
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Become a partner
        </h1>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          We work with mountains, gear brands, and other organizations to make
          events more affordable and accessible for our community. Partnership
          can look like a lift ticket discount with a resort, a gear brand
          supplying demo equipment for an event, a co-hosted meetup with another
          LGBTQ+ or outdoor organization, or a venue donating space for a gear
          drive. If your organization wants to collaborate with Chatter in any
          of these ways, we&apos;d love to hear from you.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          nativeButton={false}
          render={<Link href="/contact?topic=partnership" />}
        >
          Start a conversation
        </Button>
        <SiteImage
          url={siteImages.get_involved_partner_photo ?? null}
          alt="Chatter Snow partnership"
          className="mt-8 aspect-[21/9] rounded-2xl"
        />
      </section>
    </div>
  );
}
