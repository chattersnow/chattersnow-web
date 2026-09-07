"use client";

import { MouseEvent, useMemo, useState } from "react";
import Link from "next/link";
import { EyeOff, PanelLeftOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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

/**
 * The page list, the search box and the outline of the page being edited.
 *
 * Thirteen pages used to be a strip of pills -- six stacked rows at 390px
 * before any content -- and eighty-six slots had no overview and no search at
 * all, so "where does this sentence live?" meant clicking through every page
 * (#792). Search runs over every page's current copy, not just this one's,
 * because that is the question it exists to answer.
 */
export function ContentOutline({
  page,
  pages,
  sections,
  outline,
  hiddenPages,
  dirtyKeys,
  unpublishedKeys,
  onJump,
  onPageLink,
}: {
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
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const trimmed = query.trim().toLowerCase();

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
    if (!trimmed) return [];
    return outline
      .map((entry) => ({
        ...entry,
        page_label: pageLabels.get(entry.page) ?? entry.page,
        section_label: SECTION_LABELS.get(entry.section) ?? entry.section,
      }))
      .filter((entry) =>
        [entry.label, entry.text, entry.page_label, entry.section_label].some(
          (field) => field.toLowerCase().includes(trimmed),
        ),
      )
      .slice(0, 40);
  }, [outline, pageLabels, trimmed]);

  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mb-3 lg:hidden"
        aria-expanded={open}
        aria-controls="site-content-rail"
        onClick={() => setOpen((current) => !current)}
      >
        <PanelLeftOpen />
        {open ? "Hide pages and search" : "Pages and search"}
      </Button>

      <div
        id="site-content-rail"
        className={cn(
          // Clears the portal's own sticky header. The underscores are Tailwind's
          // spaces: `calc(a+b)` without them is invalid CSS and silently
          // drops the offset, which leaves the rail scrolling away.
          "space-y-6 lg:sticky lg:top-[calc(var(--portal-header-height)_+_1.5rem)] lg:block",
          // Thirteen pages plus an outline is taller than the viewport on
          // the longer pages, and a sticky box taller than its viewport puts
          // its own foot out of reach. It scrolls itself instead.
          "lg:max-h-[calc(100vh_-_var(--portal-header-height)_-_3rem)] lg:overflow-y-auto",
          !open && "hidden",
        )}
      >
        <div className="relative">
          <Search
            className="app-muted pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search all site content"
            aria-label="Search all site content"
            className="pl-9"
          />
        </div>

        {trimmed ? (
          <nav aria-label="Search results">
            <p className="app-muted mb-2 text-xs">
              {matches.length === 0
                ? "Nothing matches."
                : `${matches.length} slot${matches.length === 1 ? "" : "s"}`}
            </p>
            <ul className="space-y-1">
              {matches.map((match) => {
                const href = `/portal/administration/site-content?page=${match.page}`;
                const trail = `${match.page_label} › ${match.section_label}`;
                return (
                  <li key={match.key}>
                    {match.page === page.key ? (
                      <button
                        type="button"
                        onClick={() => onJump(match.key)}
                        className="hover:bg-[var(--purple-soft)] block w-full rounded-md px-2 py-1.5 text-left"
                      >
                        <ResultBody
                          label={match.label}
                          trail={trail}
                          text={snippet(match.text, trimmed)}
                        />
                      </button>
                    ) : (
                      <Link
                        href={href}
                        onClick={(event) => onPageLink(event, href)}
                        className="hover:bg-[var(--purple-soft)] block rounded-md px-2 py-1.5"
                      >
                        <ResultBody
                          label={match.label}
                          trail={trail}
                          text={snippet(match.text, trimmed)}
                        />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : (
          <>
            <nav aria-label="Pages">
              <span className="app-eyebrow">Pages</span>
              <ul className="mt-2 space-y-0.5">
                {pages.map((candidate) => {
                  const href = `/portal/administration/site-content?page=${candidate.key}`;
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
                        onClick={(event) => onPageLink(event, href)}
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
                              onClick={() => onJump(entry.key)}
                              className="hover:bg-[var(--purple-soft)] flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm"
                            >
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
                                    aria-label="Your text"
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
        )}
      </div>
    </div>
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
