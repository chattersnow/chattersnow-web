import { UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteImage } from "@/components/site-image";
import { resolvePhoto, TEAM_PHOTO_FIELD } from "@/lib/site-content";
// Type-only: @/lib/site-layout also exports getSiteLayout, which pulls in the
// server Supabase client. Nothing here is a client component, but `TeamBio` is
// imported from this file and the boundary is easier to keep than to repair.
import type { TeamLayout } from "@/lib/site-layout";
import { TeamBio } from "./team-bio";
import { TeamPortraits } from "./team-portraits";

export type TeamMember = {
  name: string;
  /** Optional and new in #917; a member without one renders no role line. */
  role?: string;
  photo_url?: string;
  photo_slot?: string;
  bio?: string[];
};

/**
 * Roughly what three lines hold at the rows layout's measure, with enough
 * headroom that a bio which would fit is never handed an expander it does not
 * need.
 *
 * Decided here, on the server, rather than left to the browser: the button has
 * to be in the HTML the server sends or it appears after hydration, and a
 * length is something a test can assert where a rendered height is not.
 * `TeamBio` corrects the call once it can measure.
 */
const BIO_CLAMP_MIN_CHARS = 240;

function bioLength(bio: string[] | undefined): number {
  return (bio ?? []).join(" ").length;
}

function hasBio(member: TeamMember): boolean {
  return Boolean(member.bio && member.bio.length > 0);
}

function photoUrl(
  member: TeamMember,
  siteImages: Record<string, string | null | undefined>,
): string | null {
  // The same call the Site Content editor's photo control makes, so what an
  // administrator was shown is what this renders (#922).
  return resolvePhoto(TEAM_PHOTO_FIELD, member, siteImages).url;
}

/** One member as a column in the grid: the page's original shape. */
function TeamMemberCard({
  member,
  siteImages,
  bioPlaceholder,
}: {
  member: TeamMember;
  siteImages: Record<string, string | null | undefined>;
  bioPlaceholder: string;
}) {
  return (
    <Card>
      <CardHeader>
        <SiteImage
          url={photoUrl(member, siteImages)}
          alt={member.name}
          icon={UserRound}
        />
      </CardHeader>
      <CardContent>
        <CardTitle>{member.name}</CardTitle>
        {member.role && <p className="app-eyebrow mt-1">{member.role}</p>}
        <div className="app-muted mt-2 space-y-3 text-sm leading-relaxed sm:text-base">
          {hasBio(member) ? (
            member.bio!.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))
          ) : (
            <p>{bioPlaceholder}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One member as a full-width row: portrait left, words right.
 *
 * A row stays a row at every width -- the portrait shrinks and the text column
 * wraps beside it rather than under it, which is what keeps a phone from
 * spending a whole screen on a photograph before the first sentence.
 */
function TeamMemberRow({
  member,
  siteImages,
}: {
  member: TeamMember;
  siteImages: Record<string, string | null | undefined>;
}) {
  const bio = member.bio ?? [];

  return (
    <li className="flex items-start gap-4 py-6 sm:gap-6">
      <SiteImage
        url={photoUrl(member, siteImages)}
        alt={member.name}
        icon={UserRound}
        // Overrides `SiteImage`'s own `w-full` through tailwind-merge; the
        // component's `aspect-square` keeps it square at every one of these.
        className="w-24 shrink-0 rounded-xl sm:w-36 md:w-40"
        sizes="(min-width: 768px) 160px, (min-width: 640px) 144px, 96px"
      />
      {/* `min-w-0` or a long unbroken word pushes the row wider than the page. */}
      <div className="min-w-0 flex-1">
        <h2 className="brand-display text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
          {member.name}
        </h2>
        {member.role && <p className="app-eyebrow mt-1">{member.role}</p>}

        {/* A member with nothing written about them yet gets a portrait, a
            name and a role. The card grid's "Bio coming soon." placeholder is
            a caption under a photo; across the full width of the page it reads
            as the organization apologising. */}
        {hasBio(member) &&
          (bioLength(member.bio) > BIO_CLAMP_MIN_CHARS ? (
            <div className="mt-3">
              <TeamBio paragraphs={bio} name={member.name} />
            </div>
          ) : (
            <div className="app-muted mt-3 max-w-[68ch] space-y-3 text-sm leading-relaxed sm:text-base">
              {bio.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ))}
      </div>
    </li>
  );
}

/**
 * The team, arranged the way the tenant asked for in Website > Layout (#917,
 * and the portraits arrangement in #1012).
 *
 * All three arrangements read the same `about_team.members` rows and resolve a
 * photo the same way; switching is a presentation decision and nothing else,
 * which is the whole argument for making it a setting rather than a rewrite.
 */
export function TeamMembers({
  members,
  siteImages,
  layout,
  bioPlaceholder,
}: {
  members: TeamMember[];
  siteImages: Record<string, string | null | undefined>;
  layout: TeamLayout;
  bioPlaceholder: string;
}) {
  if (layout === "portraits") {
    // The photo is resolved here rather than inside the client component, so
    // the image-slot registry and `resolvePhoto` stay on the server and only
    // strings cross the boundary.
    return (
      <TeamPortraits
        members={members.map((member) => ({
          name: member.name,
          role: member.role,
          bio: member.bio ?? [],
          photoUrl: photoUrl(member, siteImages),
        }))}
      />
    );
  }

  if (layout === "rows") {
    return (
      <>
        {/* Scripting off: the expander cannot work, so the clip comes off and
            the button goes away. The reader gets the whole bio -- long, but
            reachable -- rather than three lines and a dead control. */}
        <noscript>
          <style>{`.team-bio-clamped{overflow:visible;display:block;-webkit-line-clamp:unset}.team-bio-toggle{display:none}`}</style>
        </noscript>
        <ul className="mt-8 divide-y divide-[var(--line)]">
          {members.map((member) => (
            <TeamMemberRow
              key={member.name}
              member={member}
              siteImages={siteImages}
            />
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="mt-8 grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((member) => (
        <TeamMemberCard
          key={member.name}
          member={member}
          siteImages={siteImages}
          bioPlaceholder={bioPlaceholder}
        />
      ))}
    </div>
  );
}
