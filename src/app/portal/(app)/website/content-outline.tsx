"use client";

import { MouseEvent, useMemo } from "react";
import Link from "next/link";
import { EyeOff, ImageIcon } from "lucide-react";
import { PortalRail, PortalRailResults } from "@/components/portal/portal-rail";
import { cn } from "@/lib/utils";
import type { DeviceClass } from "@/proxy";
import {
  CONTENT_SECTIONS,
  type ContentPage,
  type ContentSection,
} from "@/lib/site-content";
import type { OutlineEntry } from "./content-shared";

const SECTION_LABELS = new Map(
  CONTENT_SECTIONS.map((section) => [section.key, section.label]),
);

/** Enough of the matching copy to recognise it, without wrapping the rail. */
function snippet(text: string, query: string): string {
  const at = text.toLowerCase().indexOf(query);
  if (at < 0) return text.slice(0, 60);
  const from = Math.max(0, at - 20);
  return `${from > 0 ? "…" : ""}${text.slice(from, from + 70)}${
    from + 70 < text.length ? "…" : ""
  }`;
}

type Match = OutlineEntry & { page_label: string; section_label: string };

type OutlineProps = {
  device: DeviceClass;
  page: ContentPage;
  pages: readonly ContentPage[];
  sections: readonly ContentSection[];
  outline: readonly OutlineEntry[];
  /** Page keys whose section is currently hidden from the public site. */
  hiddenPages: readonly string[];
  dirtyKeys: ReadonlySet<string>;
  /** Slots on this page whose copy the public site is not serving yet. */
  unpublishedKeys: ReadonlySet<string>;
  onJump: (slotKey: string) => void;
  onPageLink: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
};

/**
 * The page list, the search box and the outline of the page being edited.
 *
 * Thirteen pages used to be a strip of pills -- six stacked rows at 390px
 * before any content -- and eighty-six slots had no overview and no search at
 * all, so "where does this sentence live?" meant clicking through every page
 * (#792). Search runs over every page's current copy, not just this one's,
 * because that is the question it exists to answer.
 *
 * The disclosure, the sticky column and the sheet a phone gets are
 * `PortalRail`'s (#1093); what is left here is what this editor lists.
 */
export function ContentOutline({ device, page, ...rest }: OutlineProps) {
  return (
    <PortalRail
      id="site-content-rail"
      device={device}
      // Named after where the reader is, the way the event rail's has always
      // been: "Pages and search" said what the rail held and not where in it
      // you were standing.
      label={`Pages · ${page.label}`}
      hideLabel="Hide pages"
      title="Pages"
      description="Every page of the public site, and a search over all their copy."
      searchLabel="Search all site content"
      searchPlaceholder="Search all site content"
    >
      {({ query, close }) => (
        <OutlineBody page={page} query={query} close={close} {...rest} />
      )}
    </PortalRail>
  );
}

function OutlineBody({
  page,
  pages,
  sections,
  outline,
  hiddenPages,
  dirtyKeys,
  unpublishedKeys,
  onJump,
  onPageLink,
  query,
  close,
}: Omit<OutlineProps, "device"> & {
  query: string;
  close: (after?: () => void) => void;
}) {
  const pageLabels = useMemo(
    () => new Map(pages.map((candidate) => [candidate.key, candidate.label])),
    [pages],
  );
  const overriddenPerPage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of outline) {
      if (!entry.overridden) continue;
      counts.set(entry.page, (counts.get(entry.page) ?? 0) + 1);
    }
    return counts;
  }, [outline]);
  // Drafts left on another page are the easiest thing to forget, since the
  // page they belong to is one click away and looks finished from here (#793).
  const draftsPerPage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of outline) {
      if (!entry.hasDraft) continue;
      counts.set(entry.page, (counts.get(entry.page) ?? 0) + 1);
    }
    return counts;
  }, [outline]);

  const matches = useMemo<Match[]>(() => {
    if (!query) return [];
    return outline
      .map((entry) => ({
        ...entry,
        page_label: pageLabels.get(entry.page) ?? entry.page,
        section_label: SECTION_LABELS.get(entry.section) ?? entry.section,
      }))
      .filter((entry) =>
        [entry.label, entry.text, entry.page_label, entry.section_label].some(
          (field) => field.toLowerCase().includes(query),
        ),
      )
      .slice(0, 40);
  }, [outline, pageLabels, query]);

  // A jump scrolls the page behind the rail and puts focus on a control there,
  // so on a phone it has to wait for the sheet to be gone. A page link is a
  // click the caller may still want to cancel -- its handler reads the event
  // and calls `preventDefault()` -- so that one runs now and closes alongside.
  const jump = (slotKey: string) => close(() => onJump(slotKey));
  const follow = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    onPageLink(event, href);
    close();
  };

  if (query) {
    return (
      <PortalRailResults count={matches.length} noun="slot">
        <ul className="space-y-1">
          {matches.map((match) => {
            const href = `/portal/website?page=${match.page}`;
            const trail = `${match.page_label} › ${match.section_label}`;
            return (
              <li key={match.key}>
                {match.page === page.key ? (
                  <button
                    type="button"
                    onClick={() => jump(match.key)}
                    className="hover:bg-[var(--purple-soft)] block w-full rounded-md px-2 py-1.5 text-left"
                  >
                    <ResultBody
                      label={match.label}
                      trail={trail}
                      text={snippet(match.text, query)}
                    />
                  </button>
                ) : (
                  <Link
                    href={href}
                    onClick={(event) => follow(event, href)}
                    className="hover:bg-[var(--purple-soft)] block rounded-md px-2 py-1.5"
                  >
                    <ResultBody
                      label={match.label}
                      trail={trail}
                      text={snippet(match.text, query)}
                    />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </PortalRailResults>
    );
  }

  return (
    <>
      <nav aria-label="Pages">
        <span className="app-eyebrow">Pages</span>
        <ul className="mt-2 space-y-0.5">
          {pages.map((candidate) => {
            const href = `/portal/website?page=${candidate.key}`;
            const current = candidate.key === page.key;
            const customized = overriddenPerPage.get(candidate.key) ?? 0;
            const drafts = current
              ? unpublishedKeys.size
              : (draftsPerPage.get(candidate.key) ?? 0);
            return (
              <li key={candidate.key}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  onClick={(event) => follow(event, href)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                    current
                      ? "bg-[var(--purple-soft)] font-semibold text-[var(--purple-deep)]"
                      : "hover:bg-[var(--purple-soft)]",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {candidate.label}
                  </span>
                  {hiddenPages.includes(candidate.key) && (
                    <EyeOff
                      className="app-muted size-3.5 shrink-0"
                      aria-label="Hidden on the public site"
                    />
                  )}
                  {drafts > 0 && (
                    <span
                      className="bg-[var(--purple-soft)] text-[var(--purple-deep)] shrink-0 rounded-full px-1.5 text-xs font-medium tabular-nums"
                      title="Not published yet"
                    >
                      {drafts}
                    </span>
                  )}
                  {customized > 0 && (
                    <span className="app-muted shrink-0 text-xs tabular-nums">
                      {customized}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="app-muted mt-2 px-2 text-xs">
          The grey number is how many slots on that page you have written
          yourself; a highlighted number is changes not published yet.
        </p>
      </nav>

      <nav aria-label="On this page">
        <span className="app-eyebrow">On this page</span>
        <ul className="mt-2 space-y-2">
          {sections.map((section) => (
            <li key={section.key}>
              <span className="app-muted block px-2 text-xs font-semibold">
                {section.label}
              </span>
              <ul>
                {outline
                  .filter((entry) => entry.section === section.key)
                  .map((entry) => (
                    <li key={entry.key}>
                      <button
                        type="button"
                        onClick={() => jump(entry.key)}
                        className="hover:bg-[var(--purple-soft)] flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm"
                      >
                        {/* Which entries are photos, without scrolling
                            to the section that holds them (#918). */}
                        {entry.image && (
                          <ImageIcon
                            className="app-muted size-3.5 shrink-0"
                            aria-label="Photo"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {entry.label}
                        </span>
                        {dirtyKeys.has(entry.key) ? (
                          <span className="text-[var(--purple)] shrink-0 text-xs">
                            Unsaved
                          </span>
                        ) : unpublishedKeys.has(entry.key) ? (
                          <span className="text-[var(--purple)] shrink-0 text-xs">
                            Not published
                          </span>
                        ) : (
                          entry.overridden && (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-[var(--purple)]"
                              aria-label={
                                entry.image ? "Your image" : "Your text"
                              }
                            />
                          )
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function ResultBody({
  label,
  trail,
  text,
}: {
  label: string;
  trail: string;
  text: string;
}) {
  return (
    <>
      <span className="block text-sm font-medium">{label}</span>
      <span className="app-muted block text-xs">{trail}</span>
      {text && <span className="app-muted block truncate text-xs">{text}</span>}
    </>
  );
}
