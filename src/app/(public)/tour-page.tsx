/**
 * The tour pages: `/nonprofits` and `/business` (#1328), which make the same
 * argument in two vocabularies, and `/modules` (#1329), which makes it in
 * neither.
 *
 * One implementation rather than three, and the reason is not brevity -- the
 * pages are structurally identical, so a second copy of this JSX would drift,
 * and a change made to one of three marketing pages nobody visits weekly is a
 * change nobody notices was made to only one. What differs between them is a
 * page key and the slot its closing paragraph lives in, which is all any route
 * passes in.
 *
 * Lives beside `site-nav.tsx` rather than under a route folder: a directory
 * under `(public)` with no `page.tsx` is not a route, but one that looks like
 * it might be is a thing to explain to every reader of the tree.
 */

import type { Metadata } from "next";
import { CtaButton } from "@/components/cta-button";
import { SiteImage } from "@/components/site-image";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPageVisibility, hiddenSlots } from "@/lib/page-visibility";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import { getSiteImageUrls } from "@/lib/site-images";
import { liveCtas, type ContentCta } from "@/lib/site-ctas";
import {
  resolvePhoto,
  tourClosingSlot,
  tourPhotoField,
  type TourPageKey,
} from "@/lib/site-content";

/** What `<page>.modules` holds -- a content list is strings all the way down. */
type TourSection = {
  label: string;
  body: string;
  photo_url?: string;
  photo_slot?: string;
};

/**
 * The tab title for one of the three routes. Not derived from the content
 * heading: that is a sentence, and `publicTitle()` puts what it is given next
 * to the organization's name.
 */
export async function tourMetadata(title: string): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), title) };
}

export async function TourPage({ page }: { page: TourPageKey }) {
  const supabase = await createSupabaseServerClient();
  const [{ content }, siteImages, visibility] = await Promise.all([
    getPublicSite(supabase),
    getSiteImageUrls(supabase),
    getPageVisibility(supabase),
  ]);

  const hidden = hiddenSlots(visibility);
  const ctas = liveCtas(content.list<ContentCta>(`${page}.ctas`), hidden);
  const sections = content.list<TourSection>(`${page}.modules`);
  // The row's own link, then the slot it names, then the page's shared
  // screenshot -- resolved by the same call the Site Content editor's preview
  // makes, so the two cannot disagree about which source wins (#922).
  const photoField = tourPhotoField(page);

  return (
    <div>
      <div className="w-fit">
        <div className="rainbow-accent w-full" />
        <h1 className="brand-display mt-4 max-w-3xl text-4xl font-semibold tracking-brand sm:text-5xl">
          {content.text(`${page}.heading`)}
        </h1>
      </div>
      <p className="app-muted mt-4 max-w-3xl text-base leading-relaxed">
        {content.text(`${page}.intro`)}
      </p>

      {ctas.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          {ctas.map((cta, index) => (
            <CtaButton
              key={`${cta.href}-${index}`}
              href={cta.href}
              variant={index === 0 ? "rainbow" : "secondary"}
            >
              {cta.label}
            </CtaButton>
          ))}
        </div>
      )}

      <div className="mt-12 flex flex-col gap-10">
        {sections.map((section, index) => {
          const photo = resolvePhoto(photoField, section, siteImages);
          // Two columns only when there is a second column to fill. Until the
          // screenshots exist (#1332) a grid would leave every section's right
          // half empty and squeeze the words into a column half as wide as the
          // page -- which is how a page with nothing wrong with it reads as
          // unfinished.
          //
          // With a picture, the sides alternate: eight sections down one side
          // reads as a list of thumbnails rather than as an argument. The
          // picture is second in the DOM either way, so a screen reader and a
          // phone both get the heading, then the words, then the screenshot
          // that illustrates them.
          const paired = Boolean(photo.url);
          return (
            <section
              key={`${section.label}-${index}`}
              className={
                paired ? "grid items-center gap-6 sm:grid-cols-2" : undefined
              }
            >
              <div
                className={
                  paired
                    ? index % 2 === 1
                      ? "sm:order-2"
                      : undefined
                    : "max-w-3xl"
                }
              >
                <h2 className="brand-display text-2xl font-semibold tracking-brand">
                  {section.label}
                </h2>
                <p className="app-muted mt-3 text-sm leading-relaxed sm:text-base">
                  {section.body}
                </p>
              </div>
              {/* Nothing at all rather than a placeholder tile: a page whose
                  screenshots have not been taken yet should read as words,
                  not as eight empty frames. */}
              {photo.url && (
                <SiteImage
                  url={photo.url}
                  alt={section.label}
                  className="aspect-[16/9] rounded-2xl"
                  sizes="(min-width: 640px) 50vw, 100vw"
                />
              )}
            </section>
          );
        })}
      </div>

      <p className="app-muted mt-12 max-w-3xl border-t border-border pt-6 text-sm leading-relaxed">
        {content.text(`${page}.${tourClosingSlot(page)}`)}
      </p>
    </div>
  );
}
