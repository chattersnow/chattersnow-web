import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PAGE_COLUMNS,
  PUBLICATION_COLUMNS,
  toEditorIssue,
  toEditorPage,
  type PageRow,
  type PublicationRow,
} from "../publication-shared";
import { IssueEditor } from "./issue-editor";

export const metadata: Metadata = {
  title: "Publications",
};

export default async function PublicationIssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [permissions, issueResult, pagesResult, tenantResult] =
    await Promise.all([
      getCurrentUserPermissions(supabase),
      supabase
        .from("publications")
        .select(PUBLICATION_COLUMNS)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("publication_pages")
        .select(PAGE_COLUMNS)
        .eq("publication_id", id)
        .order("position"),
      supabase.rpc("current_tenant_id"),
    ]);

  const row = issueResult.data as PublicationRow | null;
  if (!row || !tenantResult.data) notFound();

  const issue = toEditorIssue(row);
  const pages = ((pagesResult.data ?? []) as PageRow[]).map(toEditorPage);

  // The editor seeds its state once; a save, publish or unpublish has to
  // remount it, or a page added this session would keep its id-less draft
  // and the form would read dirty forever.
  const version = [
    row.updated_at,
    row.status,
    ...pages.map((page) => page.id),
  ].join("|");

  return (
    <IssueEditor
      key={version}
      issue={issue}
      pages={pages}
      folder={`${tenantResult.data}/${issue.id}`}
      canEdit={hasPermission(permissions, "publications", "manage")}
    />
  );
}
