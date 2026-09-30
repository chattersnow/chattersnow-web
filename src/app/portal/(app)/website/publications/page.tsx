import type { Metadata } from "next";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getPageVisibility } from "@/lib/page-visibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IssueList, type IssueListEntry } from "./issue-list";

export const metadata: Metadata = {
  title: "Publications",
};

export default async function PublicationsPage() {
  const supabase = await createSupabaseServerClient();
  const [permissions, issuesResult, pagesResult, visibility] =
    await Promise.all([
      getCurrentUserPermissions(supabase),
      supabase
        .from("publications")
        .select("id, slug, title, season_label, publish_date, status")
        .order("publish_date", { ascending: false, nullsFirst: true })
        .order("created_at", { ascending: false }),
      supabase
        .from("publication_pages")
        .select("publication_id, alt_text, transcript"),
      getPageVisibility(supabase),
    ]);

  const counts = new Map<string, { pages: number; missing: number }>();
  for (const page of pagesResult.data ?? []) {
    const entry = counts.get(page.publication_id) ?? { pages: 0, missing: 0 };
    entry.pages += 1;
    if (!page.alt_text?.trim() || !page.transcript?.trim()) entry.missing += 1;
    counts.set(page.publication_id, entry);
  }

  const issues: IssueListEntry[] = (issuesResult.data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    seasonLabel: row.season_label,
    publishDate: row.publish_date,
    status: row.status === "published" ? "published" : "draft",
    pages: counts.get(row.id)?.pages ?? 0,
    missing: counts.get(row.id)?.missing ?? 0,
  }));

  return (
    <IssueList
      issues={issues}
      canEdit={hasPermission(permissions, "publications", "manage")}
      sectionHidden={visibility.publications === false}
    />
  );
}
