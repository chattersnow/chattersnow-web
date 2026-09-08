import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getSiteImageUrls } from "@/lib/site-images";
import { GearCatalog } from "../gear-catalog";

import { getPublicSite, publicTitle } from "@/lib/public-site";
import { isPageVisible } from "@/lib/page-visibility";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  return { title: publicTitle(await getPublicSite(supabase), "Gear Library") };
}

export default async function GearLibraryPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: items }, siteImages, { content }, sizingVisible] =
    await Promise.all([
      supabase
        .from("public_gear_catalog")
        .select(
          "id, description, size, type, gender, condition, photo_url, created_at, category_key, category_label, category_group_key, category_group_label, category_sort_order, category_group_sort_order",
        )
        .order("created_at", { ascending: false }),
      getSiteImageUrls(supabase),
      getPublicSite(supabase),
      // The guide is gated on its own slot, so the CTA has to be too -- a
      // secondary button that 404s is worse than no button.
      isPageVisible("gears-sizing"),
    ]);

  return (
    <div>
      <div className="w-fit">
        <div className="rainbow-accent w-full" />
        <h1 className="brand-display mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
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
          render={<Link href="/gears/sizing" />}
        >
          Sizing guide
        </Button>
      )}

      <div className="mt-10">
        <GearCatalog
          items={items ?? []}
          placeholderUrl={siteImages.gear_placeholder ?? null}
        />
      </div>
    </div>
  );
}
