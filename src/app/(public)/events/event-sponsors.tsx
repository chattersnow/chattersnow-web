import { SponsorTile } from "@/components/sponsor-wall";
import type { NonNullColumns, Views } from "@/lib/supabase/types";

/**
 * The sponsors of one event. Same shape as the tenant-wide wall's rows, since
 * `public_event_sponsors` and `public_sponsor_wall` expose the same columns --
 * but derived from its own generated row (#813 Phase 1), so the day the two
 * views stop agreeing the build says so.
 */
export type PublicEventSponsor = NonNullColumns<
  Omit<Views<"public_event_sponsors">, "event_id">,
  "sponsor_id"
>;

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
