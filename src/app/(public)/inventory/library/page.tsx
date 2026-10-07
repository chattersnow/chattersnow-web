import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { getSiteImageUrls } from "@/lib/site-images";
import { GearCatalog, type GearItem } from "../gear-catalog";
import { GEAR_ITEM_PARAM } from "../gear-item-path";
import type { GearPassphraseContact } from "../gear-passphrase-dialog";
import { resolveImageUrl } from "@/lib/inventory";

import { getPublicSite, publicTitle } from "@/lib/public-site";
import { isPageVisible } from "@/lib/page-visibility";
import { getPublicGearRequestOptions } from "@/lib/gear-request-options";
import {
  contactPrefill,
  loadConstituentViewer,
} from "@/lib/constituent/viewer";
import { loadAccountOffer } from "@/lib/constituent/account-offer";
import { getLegalPublication } from "@/lib/legal-publication";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const [site, params] = await Promise.all([
    getPublicSite(supabase),
    searchParams,
  ]);
  // The tab says what this organization calls its collection (#896),
  // matching the heading the page renders from `gears.library_heading`.
  const collectionTitle = publicTitle(site, site.lexicon.collection_public);

  // A shared item link names the item, in the tab and in the preview a chat
  // app unfurls from it. Only the catalog view is read, so a link to an item
  // that is reserved, hidden or made up falls back to the collection's title
  // rather than revealing anything the catalog would not show.
  const itemId = params[GEAR_ITEM_PARAM];
  if (typeof itemId !== "string") return { title: collectionTitle };
  const { data: item } = await supabase
    .from("public_gear_catalog")
    .select("description, photo_url")
    .eq("id", itemId)
    .maybeSingle();
  if (!item?.description) return { title: collectionTitle };

  const title = publicTitle(site, item.description);
  const imageUrl = resolveImageUrl(item.photo_url);
  return {
    title,
    openGraph: {
      title,
      // Only an absolute URL: there is no metadataBase to resolve a relative
      // one against, and a relative og:image is ignored by every unfurler.
      ...(imageUrl?.startsWith("http") ? { images: [imageUrl] } : {}),
    },
  };
}

export default async function GearLibraryPage() {
  const supabase = await createSupabaseServerClient();

  const [
    { data: items },
    siteImages,
    { content, lexicon, name },
    sizingVisible,
    requestOptions,
    viewer,
    publication,
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
    // Who is asking (#1357). A signed-in reader starts from what the
    // application already holds rather than retyping it -- and only from what
    // their own session knows, never from whether the directory recognises a
    // typed address (§5.23).
    loadConstituentViewer(supabase),
    // Whether the as-is notice may point at `/terms` (#1367). Free: the public
    // layout already reads this on every request for the footer's legal bar,
    // and it is `cache()`d.
    getLegalPublication(supabase),
  ]);

  // Where the passphrase dialog sends somebody without it (#1536): the
  // contact page where this tenant serves one, its public address otherwise.
  const contactEmail = requestOptions.passphraseRequired
    ? content.text("org.email_general").trim()
    : "";
  const passphraseContact: GearPassphraseContact =
    !requestOptions.passphraseRequired
      ? null
      : (await isPageVisible("contact"))
        ? { kind: "page", href: "/contact" }
        : contactEmail
          ? { kind: "email", address: contactEmail }
          : null;

  // What to offer once a request is saved (#1359). Read after the viewer
  // because it depends on it, and it costs no query of its own: the module map
  // it reads is request-cached and the public layout has already issued it.
  const accountOffer = await loadAccountOffer(viewer);

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
          prefill={contactPrefill(viewer)}
          accountOffer={accountOffer}
          lexicon={lexicon}
          termsInForce={publication.terms}
          organizationName={name}
          passphraseContact={passphraseContact}
        />
      </div>
    </div>
  );
}
