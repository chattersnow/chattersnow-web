import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact Us | Chatter Snow",
};

export default async function ContactPage() {
  const supabase = await createSupabaseServerClient();
  const siteImages = await getSiteImageUrls(supabase);

  return (
    <div className="space-y-12">
      <section>
        <div className="rainbow-accent w-16" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Get in touch
        </h1>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Questions, ideas, or want to get involved? Send us a message and
          we&apos;ll get back to you.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Card className="rainbow-surface">
          <CardContent>
            <Suspense fallback={null}>
              <ContactForm />
            </Suspense>
          </CardContent>
        </Card>

        <div className="space-y-8">
          <div>
            <span className="app-eyebrow">Email us</span>
            <div className="app-muted mt-3 space-y-1 text-sm leading-relaxed sm:text-base">
              <p>
                <a
                  href="mailto:chattersnow@gmail.com"
                  className="hover:text-foreground underline underline-offset-4"
                >
                  chattersnow@gmail.com
                </a>
              </p>
              <p>
                <a
                  href="mailto:info@chattersnow.org"
                  className="hover:text-foreground underline underline-offset-4"
                >
                  info@chattersnow.org
                </a>
              </p>
            </div>
          </div>

          <div>
            <span className="app-eyebrow">Follow us</span>
            <div className="app-muted mt-3 text-sm leading-relaxed sm:text-base">
              <p>
                Instagram{" "}
                <a
                  href="https://www.instagram.com/chattersnow"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground underline underline-offset-4"
                >
                  @chattersnow
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <SiteImage
          url={siteImages.contact_photo_1 ?? null}
          alt="Chatter Snow community members"
          className="aspect-square rounded-2xl"
        />
        <SiteImage
          url={siteImages.contact_photo_2 ?? null}
          alt="Chatter Snow community members"
          className="aspect-square rounded-2xl"
        />
        <SiteImage
          url={siteImages.contact_photo_3 ?? null}
          alt="Chatter Snow community members"
          className="aspect-square rounded-2xl"
        />
      </section>
    </div>
  );
}
