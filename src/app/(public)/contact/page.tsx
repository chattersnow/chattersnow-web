import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { InstagramLink } from "@/components/instagram-link";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { ContactForm } from "./contact-form";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Contact Us") };
}

export default async function ContactPage() {
  const supabase = await createSupabaseServerClient();
  const [siteImages, { content, name, lexicon }] = await Promise.all([
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
  ]);
  const contactEmail = content.text("org.email_general");
  const instagramHandle = content.text("org.instagram_handle");
  const imageAlt = content.text("org.image_alt");

  return (
    <div className="space-y-12">
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {content.text("contact.heading")}
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          {content.text("contact.intro")}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="rainbow-surface">
          <CardContent>
            <Suspense fallback={null}>
              <ContactForm lexicon={lexicon} />
            </Suspense>
          </CardContent>
        </Card>

        <div className="space-y-8">
          <div>
            <span className="app-eyebrow">Email us</span>
            <div className="app-muted mt-3 space-y-1 text-sm leading-relaxed sm:text-base">
              <p>
                <a
                  href={`mailto:${contactEmail}`}
                  className="hover:text-foreground underline underline-offset-4"
                >
                  {contactEmail}
                </a>
              </p>
            </div>
          </div>

          {instagramHandle && (
            <div>
              <span className="app-eyebrow">Follow us</span>
              <div className="app-muted mt-3 text-sm leading-relaxed sm:text-base">
                <InstagramLink
                  handle={instagramHandle}
                  orgName={name ?? "this organization"}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <SiteImage
          url={siteImages.contact_photo_1 ?? null}
          alt={imageAlt}
          className="aspect-square rounded-2xl"
        />
        <SiteImage
          url={siteImages.contact_photo_2 ?? null}
          alt={imageAlt}
          className="aspect-square rounded-2xl"
        />
        <SiteImage
          url={siteImages.contact_photo_3 ?? null}
          alt={imageAlt}
          className="aspect-square rounded-2xl"
        />
      </section>
    </div>
  );
}
