"use client";

import { useId, useState } from "react";
import { UserRound } from "lucide-react";
import { SiteImage } from "@/components/site-image";
import { cn } from "@/lib/utils";

/**
 * A member as this layout needs one: the photo already resolved to a URL on
 * the server, so `resolvePhoto` and the image-slot registry stay out of the
 * client bundle and only strings cross the boundary.
 */
export type TeamPortrait = {
  name: string;
  role?: string;
  bio: string[];
  photoUrl: string | null;
};

/**
 * Every face at once, and one biography at a time underneath (#1012).
 *
 * Cards and rows both put every bio on the page, which stops working somewhere
 * above a dozen people: a sixteen-seat board is six rows of tall cards, or
 * thousands of pixels of roster. This layout is for the page that has become
 * "find one person" rather than "read about the team", so its height depends
 * on the number of faces rather than on the length of anybody's writing.
 *
 * Every bio is still rendered into the server's HTML and merely hidden, for
 * the same reason the rows layout clips rather than fetches: a bio that
 * arrives on click is a bio that is not on the page for a crawler, and a
 * reader without JavaScript could reach nobody at all. With scripting off the
 * `<noscript>` rule below shows all of them under their own headings, so the
 * page degrades into a plain list of people rather than a grid of faces with
 * nothing behind it.
 */
export function TeamPortraits({ members }: { members: TeamPortrait[] }) {
  // Nothing is selected on arrival: the point of this layout is a page of
  // faces, so opening it on somebody's biography would answer a question the
  // reader has not asked yet.
  const [selected, setSelected] = useState<number | null>(null);
  const panelPrefix = useId();

  const bioId = (index: number) => `${panelPrefix}-bio-${index}`;
  const headingId = (index: number) => `${panelPrefix}-name-${index}`;

  return (
    <div className="mt-8">
      <noscript>
        <style>{`.team-portrait-bio[hidden]{display:block}.team-portrait-panel{margin-top:2rem}`}</style>
      </noscript>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {members.map((member, index) => {
          const hasBio = member.bio.length > 0;
          const isSelected = selected === index;

          const face = (
            <>
              <SiteImage
                url={member.photoUrl}
                alt={member.name}
                icon={UserRound}
                className={cn(
                  "rounded-xl transition-[box-shadow]",
                  // Marked by a ring *and* by `aria-expanded` below, so the
                  // selection is never carried by colour alone.
                  isSelected &&
                    "ring-2 ring-[var(--purple)] ring-offset-2 ring-offset-[var(--background)]",
                )}
                sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
              />
              <span className="mt-2 block text-sm font-semibold tracking-[-0.01em] sm:text-base">
                {member.name}
              </span>
              {member.role && (
                <span className="app-eyebrow mt-1 block">{member.role}</span>
              )}
            </>
          );

          return (
            <li key={member.name}>
              {hasBio ? (
                <button
                  type="button"
                  aria-expanded={isSelected}
                  aria-controls={bioId(index)}
                  onClick={() => setSelected(isSelected ? null : index)}
                  className="w-full rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {face}
                </button>
              ) : (
                // No bio, nothing to open: a portrait with a control that
                // reveals an empty panel is worse than a portrait.
                <div>{face}</div>
              )}
            </li>
          );
        })}
      </ul>

      <div
        className={cn(
          "team-portrait-panel",
          selected !== null && "mt-8 border-t border-[var(--line)] pt-6",
        )}
      >
        {members.map((member, index) =>
          member.bio.length > 0 ? (
            <section
              key={member.name}
              id={bioId(index)}
              className="team-portrait-bio"
              hidden={selected !== index}
              aria-labelledby={headingId(index)}
            >
              <h2
                id={headingId(index)}
                className="brand-display text-xl font-semibold tracking-[-0.02em] sm:text-2xl"
              >
                {member.name}
              </h2>
              {member.role && <p className="app-eyebrow mt-1">{member.role}</p>}
              <div className="app-muted mt-3 max-w-[68ch] space-y-3 text-sm leading-relaxed sm:text-base">
                {member.bio.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex}>{paragraph}</p>
                ))}
              </div>
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}
