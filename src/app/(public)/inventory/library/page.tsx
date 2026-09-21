import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getSiteImageUrls } from "@/lib/site-images";
import { GearCatalog, type GearItem } from "../gear-catalog";

import { getPublicSite, publicTitle } from "@/lib/public-site";
import { isPageVisible } from "@/lib/page-visibility";
import { getPublicGearRequestOptions } from "@/lib/gear-request-options";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const site = await getPublicSite(supabase);
  // The tab says what this organization calls its collection (#896),
  // matching the heading the page renders from `gears.library_heading`.
  return { title: publicTitle(site, site.lexicon.collection_public) };
}

export default async function GearLibraryPage() {
  const supabase = await createSupabaseServerClient();

  const [
    { data: items },
    siteImages,
    { content, lexicon },
    sizingVisible,
    requestOptions,
  ] = await Promise.all([
    supabase
      .from("public_gear_catalog")
      .select(
        "id, description, size, type, gender, condition, photo_url, created_at, category_key, category_label, category_group_key, category_group_label, category_sort_order, category_group_sort_order",
      )
      .order("created_at", { ascending: false })
      // A view drops `not null`, so the four columns the catalog treats as
      // always-present are narrowed once here (#813 Phase 1).
      .overrideTypes<GearItem[]>(),
    getSiteImageUrls(supabase),
    getPublicSite(supabase),
    // The guide is gated on its own slot, so the CTA has to be too -- a
    // secondary button that 404s is worse than no button.
    isPageVisible("gears-sizing"),
    // What the cart may offer (#1032): a meetup always, shipping when the
    // organization has turned it on and named a way to pay the postage.
    getPublicGearRequestOptions(supabase),
  ]);

  return (
    <div>
      <div className="w-fit">
        <div className="rainbow-accent w-full" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl">
          {content.text("gears.library_heading")}
        </h1>
      </div>
      <p className="app-muted mt-4 max-w-3xl text-sm leading-relaxed sm:text-base">
        {content.text("gears.library_intro")}
      </p>
      {sizingVisible && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          nativeButton={false}
          render={<Link href="/inventory/sizing" />}
        >
          Sizing guide
        </Button>
      )}

      <div className="mt-10">
        <GearCatalog
          items={items ?? []}
          placeholderUrl={siteImages.gear_placeholder ?? null}
          requestOptions={requestOptions}
          lexicon={lexicon}
        />
      </div>
    </div>
  );
}
