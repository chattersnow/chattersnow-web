"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

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
 * One sponsor's mark. Nobody controls what a sponsor sends -- a 240x40
 * wordmark and an 80x80 seal both land here -- so every one gets the same card
 * and the same height, and a logo that fails to load falls back to the name
 * rather than to a broken image (#914).
 */
export function SponsorTile({ sponsor }: { sponsor: PublicSponsor }) {
  const [logoFailed, setLogoFailed] = useState(false);

  const inner =
    sponsor.logo_url && !logoFailed ? (
      // eslint-disable-next-line @next/next/no-img-element -- sponsor logos come from arbitrary external hosts, not the curated Google Drive links next.config.ts allows for next/image
      <img
        src={sponsor.logo_url}
        alt={sponsor.name}
        className="h-12 w-full object-contain"
        onError={() => setLogoFailed(true)}
        // A dead hotlink usually fails while the page is still server-rendered
        // markup, before React has attached the handler above, and the tile
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

  return (
    <Card className="transition-colors hover:border-[var(--purple-deep)]">
      <CardContent className="flex items-center justify-center p-3">
        {sponsor.website ? (
          <a
            href={sponsor.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center"
          >
            {inner}
          </a>
        ) : (
          inner
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Every organization a tenant has publicly credited, as one grid of tiles.
 * Wider than the event page's grid because it is the whole history rather than
 * one event's sponsors; the caller decides whether to render the section at
 * all, since the heading and intro above it are tenant-owned copy.
 */
export function SponsorWall({ sponsors }: { sponsors: PublicSponsor[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {sponsors.map((sponsor) => (
        <SponsorTile key={sponsor.sponsor_id} sponsor={sponsor} />
      ))}
    </div>
  );
}
