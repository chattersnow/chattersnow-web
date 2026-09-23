import { PHOTO_CONSENT_HEADING } from "@/lib/photo-consent";
import { cn } from "@/lib/utils";

/**
 * Photos and video at this organization's events, told rather than asked
 * (#1376).
 *
 * #599 rendered a checkbox here. There is no box now: registering is itself
 * the agreement, and the remedy is objection — so this is notice, the shape
 * `volunteer-screening-notice.tsx` established and the one #1318 decided every
 * public form takes by default.
 *
 * **It still renders nothing at all when the organization has written no
 * scope** — not even a bare heading. This is the
 * one place it diverges from that component, which keeps printing
 * `FORM_ASKS_FOR` on a blank tenant because the form collects those fields
 * either way. Here there is nothing to say: what an organization does with a
 * photo is off-platform and unknowable from this codebase, and the platform
 * writes none of it (`docs/legal-basis.md` rule 2). A tenant that has written nothing renders a form byte-identical to
 * the one it had before #599 shipped, which is where almost every tenant is
 * and the state that must never break.
 *
 * **No `partyIncludesMinor` branch.** #599 reworded the box into a guardian
 * capacity. With no box there is nothing to reword, and a platform-written
 * sentence saying a registering adult's submission binds the under-18s in
 * their party would be a guardianship claim the platform is in no position to
 * make. A tenant's own paragraphs can cover minors if it wants them covered.
 *
 * **Nothing of the platform's own beneath the paragraphs.** A platform
 * sentence here used to open "There is no box to tick here" and list the ways
 * to object. It was dropped: the tenant's paragraphs are the whole notice, and
 * how to object is the organization's to say in them.
 *
 * **No link.** The scope is these paragraphs and nothing else — there is no
 * `/photo-consent` route to point at, deliberately, and the DOM test asserts
 * zero anchors for the reason `volunteer-screening-notice.tsx` gives.
 */
export function PhotoConsentNotice({
  paragraphs,
  className,
}: {
  /** The tenant's own scope. Empty on a tenant that has written none. */
  paragraphs: string[];
  className?: string;
}) {
  const written = paragraphs.filter((paragraph) => paragraph.trim());
  if (written.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {/* h3: the sheet's own title is the h2, and the page's h1 is above it. */}
      <h3 className="text-sm font-medium">{PHOTO_CONSENT_HEADING}</h3>
      {written.map((paragraph, index) => (
        <p key={index} className="app-muted text-sm leading-relaxed">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
