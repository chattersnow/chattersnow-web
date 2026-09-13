"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A team member's biography, clipped to three lines until the reader asks for
 * the rest (#917).
 *
 * Every paragraph is rendered, always. Collapsing is `line-clamp-3`, which is
 * `overflow: hidden` -- the text stays in the server-rendered HTML, in the
 * accessibility tree and in the page's selection, so a crawler and a reader
 * without JavaScript see the whole bio. Fetching it on click, or unmounting it
 * the way `@/components/ui/collapsible` does, would take it off the page for
 * both.
 *
 * Class names rather than inline styles do the clipping so the `<noscript>`
 * block in `team-members.tsx` can undo it: with scripting off the button below
 * cannot work, and a control that does nothing in front of text nobody can
 * reach is worse than no control at all.
 */
export function TeamBio({
  paragraphs,
  name,
}: {
  paragraphs: string[];
  /** Whose bio this is, for the button's accessible name. */
  name: string;
}) {
  const [expanded, setExpanded] = useState(false);
  /**
   * Starts true so the server HTML and the first client render agree -- the
   * caller only mounts this component for a bio long enough to need clipping,
   * and the measurement below is a correction rather than the decision.
   */
  const [overflowing, setOverflowing] = useState(true);
  const bioRef = useRef<HTMLDivElement>(null);
  const bioId = useId();

  useEffect(() => {
    const element = bioRef.current;
    if (!element) return;

    const measure = () => {
      // Only while clipped: expanded, `scrollHeight` and `clientHeight` are
      // equal for every bio and would retire the button that collapses it.
      if (expanded) return;
      // A zero-height measurement is not a measurement. It happens in a
      // headless DOM, in a hidden ancestor, and before a webfont settles, and
      // trusting it would strip the expander off a bio that really is clipped
      // and leave the reader no way to the rest of it.
      if (element.clientHeight === 0) return;
      setOverflowing(element.scrollHeight > element.clientHeight + 1);
    };

    measure();

    // The verdict is width-dependent: a bio that needs four lines on a phone
    // may need two on a desktop, so a rotation must not leave a stale one.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <>
      <div
        ref={bioRef}
        id={bioId}
        className={cn(
          "app-muted max-w-[68ch] text-sm leading-relaxed sm:text-base",
          expanded
            ? "space-y-3"
            : // No inter-paragraph margin while clipped: `-webkit-line-clamp`
              // counts line boxes, and a margin between paragraphs makes three
              // lines occupy the height of four.
              "team-bio-clamped line-clamp-3",
        )}
      >
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>

      {overflowing && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bioId}
          onClick={() => setExpanded((current) => !current)}
          className="team-bio-toggle mt-2 rounded-sm text-sm font-semibold text-[var(--purple)] underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {expanded ? "Show less" : "Read more"}
          {/* The visible label starts the accessible name, so the button still
              satisfies "label in name" while a screen reader hears which of
              seven Read mores it has landed on. */}
          <span className="sr-only"> about {name}</span>
        </button>
      )}
    </>
  );
}
