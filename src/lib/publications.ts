/**
 * A tenant's periodic publication (#1470): the shapes the public pages render
 * and the pure helpers they use. The reads are in `public-publications.ts`;
 * this module stays free of server-only imports so #1472's editor can share it.
 */

/** The bucket created by 20260929100000. Public read, RLS-gated write. */
export const PUBLICATION_FILES_BUCKET = "publication-files";

/** One stored resize of an image, as `*_renditions` holds it. */
export type Rendition = { path: string; width: number };

/** An image with its intrinsic size and the resized copies stored beside it. */
export type PublicationImage = {
  url: string;
  width: number;
  height: number;
  /** `url 480w, url 960w, ...`, or undefined when only the original exists. */
  srcSet?: string;
  /** The same entries as `srcSet`, smallest first, for the lightbox (#1473). */
  sources?: { url: string; width: number }[];
};

export type PublicationFile = { url: string; bytes: number };

export type PublicationSummary = {
  id: string;
  slug: string;
  title: string;
  seasonLabel: string | null;
  /** A `date` column, "2026-09-22". */
  publishDate: string | null;
  blurb: string | null;
  cover: PublicationImage | null;
};

export type PublicationPage = {
  position: number;
  image: PublicationImage;
  altText: string;
  transcript: string;
};

export type PublicationIssue = PublicationSummary & {
  readingPdf: PublicationFile | null;
  printPdf: PublicationFile | null;
  pages: PublicationPage[];
};

/**
 * Parses a `*_renditions` column. Anything malformed is dropped rather than
 * thrown on: a page with no usable rendition still renders its original.
 */
export function parseRenditions(value: unknown): Rendition[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Rendition =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Rendition).path === "string" &&
        Number.isInteger((entry as Rendition).width) &&
        (entry as Rendition).width > 0,
    )
    .sort((a, b) => a.width - b.width);
}

/**
 * Builds the image the page renders: the original as `src`, and a `srcset`
 * from the stored renditions plus the original at its own width.
 */
export function publicationImage(
  path: string,
  width: number,
  height: number,
  renditions: readonly Rendition[],
  toUrl: (path: string) => string,
): PublicationImage {
  const url = toUrl(path);
  if (renditions.length === 0) return { url, width, height };

  const entries = new Map<number, string>();
  for (const rendition of renditions) {
    entries.set(rendition.width, toUrl(rendition.path));
  }
  if (!entries.has(width)) entries.set(width, url);

  const sources = [...entries.entries()]
    .sort(([a], [b]) => a - b)
    .map(([w, u]) => ({ url: u, width: w }));
  const srcSet = sources
    .map((source) => `${source.url} ${source.width}w`)
    .join(", ");
  return { url, width, height, srcSet, sources };
}

/** A download's size as a reader thinks of it: "820 KB", "18 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1).replace(/\.0$/, "") : Math.round(mb)} MB`;
}

/**
 * The issues either side of one in an index sorted newest first: `newer` is
 * the next issue a reader would move forward to, `older` the previous one.
 */
export function adjacentIssues<T extends { slug: string }>(
  issues: readonly T[],
  slug: string,
): { newer: T | null; older: T | null } {
  const at = issues.findIndex((issue) => issue.slug === slug);
  if (at === -1) return { newer: null, older: null };
  return {
    newer: issues[at - 1] ?? null,
    older: issues[at + 1] ?? null,
  };
}

// ---------------------------------------------------------------------------
// The reader (#1473). Pure, so they are tested without a browser.
// ---------------------------------------------------------------------------

/** Where a page sits when the reader shows facing pages. */
export type SpreadSide = "alone" | "left" | "right";

/**
 * How an issue's pages pair up as a printed copy opens: the cover alone, then
 * 2-3, 4-5 and so on, and the back cover alone. A page left over in the middle
 * (an odd count, which a folded zine never has) stands alone too. Indexed by
 * position - 1.
 */
export function spreadSides(count: number): SpreadSide[] {
  const sides: SpreadSide[] = [];
  for (let position = 1; position <= count; position += 1) {
    const isEnd = position === 1 || position === count;
    const hasPartner =
      position % 2 === 0 ? position + 1 < count : position - 1 > 1;
    sides.push(
      isEnd || !hasPartner ? "alone" : position % 2 === 0 ? "left" : "right",
    );
  }
  return sides;
}

/** The positions shown together with `position`: itself and its facing page. */
export function spreadOf(position: number, count: number): number[] {
  const side = spreadSides(count)[position - 1];
  if (side === "left") return [position, position + 1];
  if (side === "right") return [position - 1, position];
  return [position];
}

/** The page a `#page-N` hash points at, or null when it names no page. */
export function pageFromHash(hash: string, count: number): number | null {
  const match = /^#page-(\d+)$/.exec(hash);
  if (!match) return null;
  const position = Number(match[1]);
  return position >= 1 && position <= count ? position : null;
}

// ---------------------------------------------------------------------------
// The editor's rules (#1472). Pure, so the portal and its tests share them.
// ---------------------------------------------------------------------------

/**
 * The widths the editor stores for each page and cover, in pixels. The largest
 * is also the `image_path` a page renders as `src`; the smaller two are what
 * lets a phone fetch a ~60 KB page instead of a ~400 KB one.
 */
export const PUBLICATION_IMAGE_WIDTHS = [480, 960, 1600] as const;

/** The bucket's own cap (20260929100000), checked before a PDF is sent. */
export const PUBLICATION_PDF_MAX_BYTES = 25 * 1024 * 1024;

/** The database's `publications_slug_format`, so a bad slug is a sentence. */
const PUBLICATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PUBLICATION_SLUG_MAX = 80;

export function isValidPublicationSlug(value: string): boolean {
  return (
    value.length <= PUBLICATION_SLUG_MAX && PUBLICATION_SLUG_PATTERN.test(value)
  );
}

/** Lower-case words joined by single hyphens, as the slug check wants. */
export function publicationSlugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PUBLICATION_SLUG_MAX)
    .replace(/-+$/, "");
}

/**
 * The slug the editor suggests: `<season>-<yyyy>`, "fall-2026". The year comes
 * from the publish date, and is not repeated when the season label already
 * carries it ("Fall 2026"). Empty when there is nothing to suggest from.
 */
export function suggestPublicationSlug(
  seasonLabel: string,
  publishDate: string,
): string {
  const season = publicationSlugify(seasonLabel);
  const year = /^(\d{4})-/.exec(publishDate)?.[1] ?? "";
  if (!season) return year;
  if (!year || season.split("-").includes(year)) return season;
  return `${season}-${year}`;
}

/**
 * Picked files in reading order: by name, with numbers compared as numbers, so
 * `page-2.jpg` comes before `page-10.jpg` the way a person numbered them.
 */
export function byFileName<T extends { name: string }>(
  files: readonly T[],
): T[] {
  return [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

/**
 * The widths worth storing for an image `sourceWidth` pixels wide: each target
 * that does not enlarge it, plus the source's own width when it is narrower
 * than the largest target, so a small scan is kept at its real size rather than
 * blown up. Always at least one.
 */
export function renditionWidths(
  sourceWidth: number,
  targets: readonly number[] = PUBLICATION_IMAGE_WIDTHS,
): number[] {
  const widths = new Set<number>();
  for (const target of targets) {
    if (target <= sourceWidth) widths.add(target);
  }
  const largest = Math.max(...targets);
  if (sourceWidth < largest) widths.add(Math.max(1, Math.round(sourceWidth)));
  return [...widths].sort((a, b) => a - b);
}

/** Moves one entry of a list, for the page order's up/down and drag. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return [...list];
  const clamped = Math.max(0, Math.min(list.length - 1, to));
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(clamped, 0, item);
  return next;
}

/** Whether a page has what publishing needs: alt text and a transcript. */
export function pageHasText(page: {
  altText: string;
  transcript: string;
}): boolean {
  return page.altText.trim() !== "" && page.transcript.trim() !== "";
}

/** How many pages still lack alt text or a transcript. */
export function pagesMissingText(
  pages: readonly { altText: string; transcript: string }[],
): number {
  return pages.filter((page) => !pageHasText(page)).length;
}
