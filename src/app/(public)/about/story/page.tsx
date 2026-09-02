import type { Metadata } from "next";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteImageUrls } from "@/lib/site-images";

export const metadata: Metadata = {
  title: "Our Story | Chatter Snow",
};

export default async function StoryPage() {
  const supabase = await createSupabaseServerClient();
  const siteImages = await getSiteImageUrls(supabase);

  return (
    <div>
      <section>
        <div className="w-fit">
          <div className="rainbow-accent w-full" />
          <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            About Chatter
          </h1>
        </div>
        <div className="app-muted mt-4 max-w-3xl space-y-4 text-sm leading-relaxed sm:text-base">
          <p>
            Chatter is a queer ski and snowboard community on the East Coast
            that brings LGBTQ+ riders together both on and off the mountain.
            What started as a small group of friends has grown into a community
            hosting indoor and mountain meetups, collaborating with other
            organizations, and creating opportunities for queer skiers and
            snowboarders to get involved regardless of experience or budget.
          </p>
          <p>
            At its core, Chatter is about making snow sports more accessible and
            building community around them. That means more than just organizing
            group rides. Chatter provides gear through donations and drives,
            facilitates gear swaps, connects newer riders with on-snow
            mentorship, and works with mountains and partners to make events
            more affordable.
          </p>
        </div>
      </section>
      <section className="mt-12 grid gap-8 sm:grid-cols-3 sm:items-start">
        <div className="sm:col-span-2">
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            Our Story
          </h2>
          <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
            <p>
              Chatter started three summers ago when a group of friends wanted
              to create a space where queer skiers and snowboarders could find
              each other, ride together, and feel like they belonged on the
              mountain.
            </p>
            <p>
              Since then, that idea has grown into an East Coast community.
              We&apos;ve brought people together through indoor snow sessions,
              mountain meetups, park days, collaborations, and events with
              partner organizations. Our community is largely centered around
              the NYC area, but we&apos;re continuing to grow our reach across
              the East Coast.
            </p>
            <p>
              As we&apos;ve grown, we&apos;ve realized that simply creating
              opportunities to ride together isn&apos;t enough. Snow sports can
              be expensive and intimidating to get into, especially for someone
              who doesn&apos;t already have the equipment, knowledge, or
              community around them.
            </p>
            <p>That&apos;s where Chatter&apos;s bigger purpose comes in.</p>
            <p>
              We&apos;re working to make skiing and snowboarding more accessible
              to LGBTQ+ people by helping remove some of the financial and
              social barriers that keep people off the mountain. Through gear
              donations and swaps, beginner mentorship, affordable group events,
              and partnerships with mountains and other organizations,
              we&apos;re building a community where people can get into snow
              sports, improve their skills, and find people to ride with.
            </p>
          </div>
        </div>
        <SiteImage
          url={siteImages.about_story_photo ?? null}
          alt="Chatter Snow community members"
          className="aspect-[3/4] self-start rounded-xl sm:sticky sm:top-24"
        />
      </section>
    </div>
  );
}
