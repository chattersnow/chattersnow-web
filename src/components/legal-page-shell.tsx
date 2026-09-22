import type { ReactNode } from "react";
import {
  LegalSectionNav,
  type LegalSection,
} from "@/components/legal-section-nav";

export type { LegalSection };

/**
 * Frame for the long-form legal pages (/privacy, /terms, /code-of-conduct,
 * /accessibility): a left rail of section links, the document beside it, and
 * the shared title block each of them used to repeat.
 *
 * The rail is on the left because that is where readers look. NN/g ranks the
 * right rail last of the three table-of-contents placements -- "right-rail
 * blindness", the learned habit of skipping the column ads live in -- and
 * these are reference documents people jump into rather than read top to
 * bottom, so the nav has to be somewhere it will actually be seen.
 *
 * It also has to exist at all. These pages are pure prose: capping every
 * child at the reading measure inside the max-w-6xl shell, with nothing
 * beside it, left a lone column and half an empty viewport. The other public
 * pages avoid that by accident, holding their body text to max-w-3xl while
 * sitting next to full-width grids and images.
 *
 * Below `lg` the rail is replaced by a collapsed <details> under the title,
 * rather than dropped: these are the longest pages on the site, and small
 * screens are where scrolling past a dozen headings costs the most.
 */
export function LegalPageShell({
  title,
  banner,
  lastUpdated,
  dateLabel = "Last updated",
  summary,
  sections,
  children,
}: {
  title: string;
  /**
   * Rendered above the title, before anything else on the page. For the one
   * thing a reader has to know before they start reading rather than after --
   * today, that this is a superseded version of the document (#601). Nothing
   * a tenant can write goes here.
   */
  banner?: ReactNode;
  lastUpdated: string;
  /**
   * What the date under the title is. "Last updated" for the legal
   * documents; a promotion's official rules say "Effective" instead, because
   * the date is the moment that version took force rather than the day
   * somebody edited it (#1322).
   */
  dateLabel?: string;
  /** The "short version" opening. Every one of these pages gets one: people
   *  scan policy pages rather than read them, so the page has to answer the
   *  reader's question before it starts explaining itself. */
  summary: ReactNode;
  sections: readonly LegalSection[];
  children: ReactNode;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,15rem)_minmax(0,48rem)] lg:gap-16 print:block">
      <aside className="hidden lg:block print:hidden">
        <nav aria-label="On this page" className="sticky top-8">
          <span className="app-eyebrow">On this page</span>
          <LegalSectionNav sections={sections} />
        </nav>
      </aside>

      {/* Anchor targets clear the top of the viewport rather than butting
          against it. Set here so each page's <section> elements stay plain. */}
      <div className="space-y-12 [&_section]:scroll-mt-8 print:max-w-none">
        <section id="top">
          {banner}
          <div className="w-fit">
            <div className="rainbow-accent w-full" />
            <h1 className="brand-display mt-4 text-4xl font-semibold tracking-brand sm:text-5xl">
              {title}
            </h1>
          </div>
          <p className="app-muted mt-4 text-sm">
            {dateLabel}: {lastUpdated}
          </p>
          <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
            {summary}
          </div>
        </section>

        <details className="border-t border-[var(--line)] pt-4 lg:hidden print:hidden">
          <summary className="app-eyebrow cursor-pointer">On this page</summary>
          <ul className="mt-4 space-y-1">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="app-muted block py-1 text-sm leading-snug hover:text-foreground"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </details>

        {children}

        <p className="print:hidden">
          <a
            href="#top"
            className="app-muted text-sm hover:text-foreground underline-offset-4 hover:underline"
          >
            Back to top
          </a>
        </p>
      </div>
    </div>
  );
}
