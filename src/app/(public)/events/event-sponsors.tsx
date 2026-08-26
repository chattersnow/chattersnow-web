"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

export type PublicEventSponsor = {
  sponsor_id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
};

function SponsorTile({ sponsor }: { sponsor: PublicEventSponsor }) {
  const [logoFailed, setLogoFailed] = useState(false);

  const inner =
    sponsor.logo_url && !logoFailed ? (
      // eslint-disable-next-line @next/next/no-img-element -- sponsor logos come from arbitrary external hosts, not the curated Google Drive links next.config.ts allows for next/image
      <img
        src={sponsor.logo_url}
        alt={sponsor.name}
        className="h-12 w-full object-contain"
        onError={() => setLogoFailed(true)}
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

export function EventSponsors({
  sponsors,
}: {
  sponsors: PublicEventSponsor[];
}) {
  if (sponsors.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="brand-display text-lg font-semibold tracking-[-0.02em]">
        Sponsors
      </h3>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {sponsors.map((sponsor) => (
          <SponsorTile key={sponsor.sponsor_id} sponsor={sponsor} />
        ))}
      </div>
    </div>
  );
}
