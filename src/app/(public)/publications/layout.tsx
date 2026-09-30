import { PageShell } from "@/components/page-shell";
import { requireVisiblePage } from "@/lib/page-visibility";
import { canPreviewPublications } from "@/lib/public-publications";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The publications section (#1471). One gate for the index and every issue:
 * the slot is off until the tenant turns it on, and off whenever the
 * publications module is.
 *
 * Except for the tenant's own editors (#1472), who preview an issue at its
 * public address before anyone else can reach it -- which is usually before
 * the section is switched on at all, since there is nothing to show until the
 * first issue is published.
 */
export default async function PublicationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireVisiblePage("publications", async () =>
    canPreviewPublications(await createSupabaseServerClient()),
  );
  return <PageShell>{children}</PageShell>;
}
