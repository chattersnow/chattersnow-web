import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";
import { isPageVisible } from "@/lib/page-visibility";

export const metadata: Metadata = {
  title: "Get Involved | Chatter Snow",
};

export default async function GetInvolvedPage() {
  const supabase = await createSupabaseServerClient();
  const siteImages = await getSiteImageUrls(supabase);
  const supportVisible = await isPageVisible("support");

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SiteImage
          url={siteImages.get_involved_hero_1 ?? null}
          alt="Chatter Snow community members"
          className="col-span-2 aspect-[2/1] rounded-2xl sm:aspect-[4/3]"
        />
        <SiteImage
          url={siteImages.get_involved_hero_2 ?? null}
          alt="Chatter Snow community members"
          className="aspect-square rounded-2xl"
        />
        <SiteImage
          url={siteImages.get_involved_hero_3 ?? null}
          alt="Chatter Snow community members"
          className="aspect-square rounded-2xl"
        />
      </div>

      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Get involved
          </h1>
        </div>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Chatter runs on people showing up in whatever way works for them — on
          the mountain, behind the scenes, or by helping us grow.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Button
          nativeButton={false}
          render={<Link href="/get-involved/attend" />}
        >
          Attend
        </Button>
        <Button
          nativeButton={false}
          render={<Link href="/get-involved/volunteer" />}
        >
          Volunteer
        </Button>
        <Button
          nativeButton={false}
          render={<Link href="/get-involved/partner" />}
        >
          Become a partner
        </Button>
      </section>

      <section>
        <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
          Sponsor Chatter
        </h2>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Sponsorships help fund events, gear, and programs.
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
          Donate gear
        </h2>
        <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
          Have gear you&apos;re not using? Donating it helps another rider get
          on the mountain. See what we accept on our{" "}
          <Link
            href="/gears/donate#donate"
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
