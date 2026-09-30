import { parseRenditions, type Rendition } from "@/lib/publications";

/**
 * The editor's view of an issue (#1472), shared by the server page that reads
 * it and the client editor that changes it. Paths, never URLs: the rows hold
 * object paths in `publication-files`, and the editor turns them into URLs
 * only to draw a thumbnail.
 */

export const PUBLICATIONS_PATH = "/portal/website/publications";

export type EditorImage = {
  path: string;
  width: number;
  height: number;
  renditions: Rendition[];
};

export type EditorFile = { path: string; bytes: number };

export type EditorPage = {
  /** Stable across reorders; the row id once saved. */
  key: string;
  /** Absent for a page uploaded in this session and not yet saved. */
  id?: string;
  image: EditorImage;
  altText: string;
  transcript: string;
};

export type EditorIssue = {
  id: string;
  slug: string;
  title: string;
  seasonLabel: string;
  /** "2026-09-22", or "" when unset. */
  publishDate: string;
  blurb: string;
  cover: EditorImage | null;
  readingPdf: EditorFile | null;
  printPdf: EditorFile | null;
  status: "draft" | "published";
  /** Set by the first publish and never cleared: the slug is frozen from then. */
  publishedAt: string | null;
  updatedAt: string;
};

/** The fields a save writes, as the editor holds them. */
export type IssueDetails = Omit<
  EditorIssue,
  "id" | "status" | "publishedAt" | "updatedAt"
>;

export const PUBLICATION_COLUMNS =
  "id, slug, title, season_label, publish_date, blurb, cover_path, cover_width, cover_height, cover_renditions, reading_pdf_path, reading_pdf_bytes, print_pdf_path, print_pdf_bytes, status, published_at, updated_at";

export const PAGE_COLUMNS =
  "id, position, image_path, width, height, image_renditions, alt_text, transcript";

export type PublicationRow = {
  id: string;
  slug: string;
  title: string;
  season_label: string | null;
  publish_date: string | null;
  blurb: string | null;
  cover_path: string | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_renditions: unknown;
  reading_pdf_path: string | null;
  reading_pdf_bytes: number | null;
  print_pdf_path: string | null;
  print_pdf_bytes: number | null;
  status: string;
  published_at: string | null;
  updated_at: string;
};

export type PageRow = {
  id: string;
  position: number;
  image_path: string;
  width: number;
  height: number;
  image_renditions: unknown;
  alt_text: string | null;
  transcript: string | null;
};

function toFile(path: string | null, bytes: number | null): EditorFile | null {
  return path && bytes ? { path, bytes } : null;
}

export function toEditorIssue(row: PublicationRow): EditorIssue {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    seasonLabel: row.season_label ?? "",
    publishDate: row.publish_date ?? "",
    blurb: row.blurb ?? "",
    cover:
      row.cover_path && row.cover_width && row.cover_height
        ? {
            path: row.cover_path,
            width: row.cover_width,
            height: row.cover_height,
            renditions: parseRenditions(row.cover_renditions),
          }
        : null,
    readingPdf: toFile(row.reading_pdf_path, row.reading_pdf_bytes),
    printPdf: toFile(row.print_pdf_path, row.print_pdf_bytes),
    status: row.status === "published" ? "published" : "draft",
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

export function toEditorPage(row: PageRow): EditorPage {
  return {
    key: row.id,
    id: row.id,
    image: {
      path: row.image_path,
      width: row.width,
      height: row.height,
      renditions: parseRenditions(row.image_renditions),
    },
    altText: row.alt_text ?? "",
    transcript: row.transcript ?? "",
  };
}

/** Every object path an issue's details and pages point at. */
export function referencedPaths(
  details: Pick<IssueDetails, "cover" | "readingPdf" | "printPdf">,
  pages: readonly Pick<EditorPage, "image">[],
): string[] {
  const images = [details.cover, ...pages.map((page) => page.image)];
  return [
    ...images.flatMap((image) =>
      image ? [image.path, ...image.renditions.map((r) => r.path)] : [],
    ),
    ...[details.readingPdf, details.printPdf].flatMap((file) =>
      file ? [file.path] : [],
    ),
  ];
}
