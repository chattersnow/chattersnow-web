"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type LegalSection = { id: string; title: string };

/**
 * The section list beside a legal document, with the section you are currently
 * reading marked.
 *
 * The highlight is not decoration. A sticky list of links that never changes
 * is easy to stop seeing, and on a document that runs to a dozen headings the
 * reader otherwise has no answer to "how far in am I". The moving mark gives
 * both, which is why it is worth the client component on an otherwise fully
 * static page.
 */
export function LegalSectionNav({
  sections,
}: {
  sections: readonly LegalSection[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;

      // A section is "the one you're reading" once its heading has crossed a
      // line a fifth of the way down the viewport -- not while its closing
      // paragraph is still trailing off the bottom.
      const line = window.scrollY + window.innerHeight * 0.2;

      let current: string | null = null;
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top + window.scrollY <= line) {
          current = section.id;
        }
      }

      // The last sections of a document can never reach that line -- the page
      // runs out of scroll first -- so nothing below the fold would ever be
      // marked. At the bottom, the last section is the one you're on.
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;

      setActiveId(
        atBottom ? (sections.at(-1)?.id ?? current) : current,
        // Before the first heading crosses the line, `current` is null and
        // nothing is marked: the reader is still in the opening, not in a
        // section.
      );
    };

    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sections]);

  return (
    <ul className="mt-4 space-y-1">
      {sections.map((section) => {
        const isActive = section.id === activeId;
        return (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={isActive ? "location" : undefined}
              className={cn(
                "block py-1 text-sm leading-snug hover:text-foreground",
                isActive ? "text-foreground font-semibold" : "app-muted",
              )}
            >
              {section.title}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
