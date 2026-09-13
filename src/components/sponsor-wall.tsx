"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
// Type-only: @/lib/site-layout also exports getSiteLayout, which pulls in
// createSupabaseServerClient and must not reach the client bundle.
import type { SponsorWallLayout } from "@/lib/site-layout";

/**
 * A sponsor as the public site sees one: the name, and the logo and website
 * from its `people` row. Shared by the event detail page
 * (`public_event_sponsors`) and the tenant-wide wall (`public_sponsor_wall`),
 * which expose the same columns on purpose.
 */
export type PublicSponsor = {
  sponsor_id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
};

/**
 * One sponsor's mark, with the chrome left to the caller: the logo, the name
 * fallback, and the link out to the sponsor's own site.
 *
 * Both arrangements of the wall render this, so the fallback lives in one
 * place. Nobody controls what a sponsor sends -- a 240x40 wordmark and an
 * 80x80 seal both land here -- so the caller pins the height, and a logo that
 * fails to load falls back to the name rather than to a broken image (#914).
 */
function SponsorMark({
  sponsor,
  imgClassName,
  linkClassName,
}: {
  sponsor: PublicSponsor;
  imgClassName: string;
  linkClassName: string;
}) {
  const [logoFailed, setLogoFailed] = useState(false);

  const inner =
    sponsor.logo_url && !logoFailed ? (
      // eslint-disable-next-line @next/next/no-img-element -- sponsor logos come from arbitrary external hosts, not the curated Google Drive links next.config.ts allows for next/image
      <img
        src={sponsor.logo_url}
        alt={sponsor.name}
        className={imgClassName}
        onError={() => setLogoFailed(true)}
        // A dead hotlink usually fails while the page is still server-rendered
        // markup, before React has attached the handler above, and the mark
        // then shows a broken-image icon and the alt text rather than the
        // fallback. A whole wall of external logos is where that shows up
        // (#914), so the mounted element is asked directly: `complete` with no
        // intrinsic width is a load that already failed.
        ref={(node) => {
          if (node?.complete && node.naturalWidth === 0) setLogoFailed(true);
        }}
      />
    ) : (
      <span className="text-sm font-medium">{sponsor.name}</span>
    );

  if (!sponsor.website) return inner;

  return (
    <a
      href={sponsor.website}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClassName}
    >
      {inner}
    </a>
  );
}

/**
 * One sponsor's mark in a card of its own, at a uniform height. Used by the
 * tile grid here and, directly, by the event detail page's sponsor block.
 */
export function SponsorTile({ sponsor }: { sponsor: PublicSponsor }) {
  return (
    <Card className="transition-colors hover:border-[var(--purple-deep)]">
      <CardContent className="flex items-center justify-center p-3">
        <SponsorMark
          sponsor={sponsor}
          imgClassName="h-12 w-full object-contain"
          linkClassName="flex w-full items-center justify-center"
        />
      </CardContent>
    </Card>
  );
}

/**
 * One sponsor's mark with no chrome at all, for the band (#1013). The width is
 * capped rather than filled, so a wordmark and a seal sit side by side at the
 * same height and a row of them wraps instead of overflowing on a phone.
 */
function SponsorBandMark({ sponsor }: { sponsor: PublicSponsor }) {
  return (
    <SponsorMark
      sponsor={sponsor}
      imgClassName="h-10 w-auto max-w-40 object-contain"
      linkClassName="flex items-center justify-center"
    />
  );
}

/**
 * Every organization a tenant has publicly credited.
 *
 * Two arrangements, chosen by the tenant in Website > Layout (#1013). `cards`
 * is the tile grid the section has always been -- wider than the event page's
 * grid because it is the whole history rather than one event's sponsors.
 * `band` is one quiet row for a tenant with a handful of logos, or one whose
 * wall should support the donate call to action below it rather than compete
 * with it.
 *
 * The caller decides whether to render the section at all, since the heading
 * and intro above it are tenant-owned copy.
 */
export function SponsorWall({
  sponsors,
  layout = "cards",
}: {
  sponsors: PublicSponsor[];
  layout?: SponsorWallLayout;
}) {
  if (layout === "band") {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-8">
        {sponsors.map((sponsor) => (
          <SponsorBandMark key={sponsor.sponsor_id} sponsor={sponsor} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {sponsors.map((sponsor) => (
        <SponsorTile key={sponsor.sponsor_id} sponsor={sponsor} />
      ))}
    </div>
  );
}
