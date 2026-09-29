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

  const srcSet = [...entries.entries()]
    .sort(([a], [b]) => a - b)
    .map(([w, u]) => `${u} ${w}w`)
    .join(", ");
  return { url, width, height, srcSet };
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
