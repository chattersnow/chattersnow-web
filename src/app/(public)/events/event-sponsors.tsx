import { SponsorTile, type PublicSponsor } from "@/components/sponsor-wall";

/**
 * The sponsors of one event. Same shape as the tenant-wide wall's rows, since
 * `public_event_sponsors` and `public_sponsor_wall` expose the same columns.
 */
export type PublicEventSponsor = PublicSponsor;

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
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {sponsors.map((sponsor) => (
          <SponsorTile key={sponsor.sponsor_id} sponsor={sponsor} />
        ))}
      </div>
    </div>
  );
}
