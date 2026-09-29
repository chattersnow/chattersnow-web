import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PUBLICATION_FILES_BUCKET,
  parseRenditions,
  publicationImage,
  type PublicationFile,
  type PublicationIssue,
  type PublicationSummary,
} from "@/lib/publications";

/**
 * The public site's read of the tenant's publication (#1471), through the two
 * definer views 20260929100000 creates. Both are resolved from the request
 * host and serve published issues only, so nothing here has to know what a
 * draft is.
 */

type IssueRow = {
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
};

type PageRow = {
  position: number;
  image_path: string;
  width: number;
  height: number;
  image_renditions: unknown;
  alt_text: string | null;
  transcript: string | null;
};

function fileUrl(supabase: SupabaseClient) {
  return (path: string) =>
    supabase.storage.from(PUBLICATION_FILES_BUCKET).getPublicUrl(path).data
      .publicUrl;
}

function toSummary(
  row: IssueRow,
  toUrl: (path: string) => string,
): PublicationSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    seasonLabel: row.season_label,
    publishDate: row.publish_date,
    blurb: row.blurb,
    cover:
      row.cover_path && row.cover_width && row.cover_height
        ? publicationImage(
            row.cover_path,
            row.cover_width,
            row.cover_height,
            parseRenditions(row.cover_renditions),
            toUrl,
          )
        : null,
  };
}

function toFile(
  path: string | null,
  bytes: number | null,
  toUrl: (path: string) => string,
): PublicationFile | null {
  return path && bytes ? { url: toUrl(path), bytes } : null;
}

/** Every published issue, newest first. Cached per request. */
export const getPublicPublications = cache(
  async (supabase: SupabaseClient): Promise<PublicationSummary[]> => {
    const { data, error } = await supabase
      .from("public_publications")
      .select("*")
      .order("publish_date", { ascending: false, nullsFirst: false })
      .order("published_at", { ascending: false });

    if (error) {
      // Same stance as `getPublicArticleCategories`: render none and say so.
      console.error(
        "[public-publications] could not read public_publications; rendering none",
        error,
      );
      return [];
    }

    const toUrl = fileUrl(supabase);
    return ((data ?? []) as IssueRow[]).map((row) => toSummary(row, toUrl));
  },
);

/** One issue by its `/publications/<slug>` segment, with its pages. */
export const getPublicPublication = cache(
  async (
    supabase: SupabaseClient,
    slug: string,
  ): Promise<PublicationIssue | null> => {
    const { data: row, error } = await supabase
      .from("public_publications")
      .select("*")
      .eq("slug", slug)
      .maybeSingle<IssueRow>();

    if (error) {
      console.error(
        "[public-publications] could not read public_publications",
        error,
      );
      return null;
    }
    if (!row) return null;

    const pages = await supabase
      .from("public_publication_pages")
      .select(
        "position, image_path, width, height, image_renditions, alt_text, transcript",
      )
      .eq("publication_id", row.id)
      .order("position");

    if (pages.error) {
      console.error(
        "[public-publications] could not read public_publication_pages",
        pages.error,
      );
    }

    const toUrl = fileUrl(supabase);
    return {
      ...toSummary(row, toUrl),
      readingPdf: toFile(row.reading_pdf_path, row.reading_pdf_bytes, toUrl),
      printPdf: toFile(row.print_pdf_path, row.print_pdf_bytes, toUrl),
      pages: ((pages.data ?? []) as PageRow[]).map((page) => ({
        position: page.position,
        image: publicationImage(
          page.image_path,
          page.width,
          page.height,
          parseRenditions(page.image_renditions),
          toUrl,
        ),
        altText: page.alt_text ?? `Page ${page.position}`,
        transcript: page.transcript ?? "",
      })),
    };
  },
);
