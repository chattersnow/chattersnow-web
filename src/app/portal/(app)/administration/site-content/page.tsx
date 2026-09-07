import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CONTENT_PAGES,
  resolveSiteContent,
  slotsForPage,
  type SiteContentRow,
} from "@/lib/site-content";
import { ContentEditor, type EditorSlot } from "./content-editor";

export const metadata: Metadata = {
  title: "Site Content",
};

export default async function SiteContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = typeof params.page === "string" ? params.page : "";
  const page =
    CONTENT_PAGES.find((candidate) => candidate.key === requested) ??
    CONTENT_PAGES[0];

  const supabase = await createSupabaseServerClient();
  const [permissions, { data: rows }] = await Promise.all([
    getCurrentUserPermissions(supabase),
    supabase.from("site_content").select("key, value"),
  ]);
  const content = resolveSiteContent((rows ?? []) as SiteContentRow[]);
  const canEdit = hasPermission(permissions, "site_content", "manage");

  // The editor gets the current value of every slot on the page -- the
  // tenant's own where set, the registry default otherwise -- and which is
  // which, so it can offer "back to default" only where it means something.
  const slots: EditorSlot[] = slotsForPage(page.key).map((slot) => ({
    slot,
    value:
      slot.type === "text"
        ? content.text(slot.key)
        : slot.type === "paragraphs"
          ? content.paragraphs(slot.key)
          : slot.type === "list"
            ? content.list(slot.key)
            : content.document(slot.key),
    overridden: content.overrides.has(slot.key),
  }));

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Site Content
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <p className="app-muted mt-6 max-w-3xl text-sm leading-relaxed">
        The words on the public website, page by page.
      </p>

      <nav aria-label="Pages" className="mt-6 flex flex-wrap gap-2">
        {CONTENT_PAGES.map((candidate) => (
          <Button
            key={candidate.key}
            size="sm"
            variant={candidate.key === page.key ? "default" : "secondary"}
            nativeButton={false}
            render={
              <Link
                href={`/portal/administration/site-content?page=${candidate.key}`}
                aria-current={candidate.key === page.key ? "page" : undefined}
              />
            }
          >
            {candidate.label}
          </Button>
        ))}
      </nav>

      <div className="mt-6">
        <ContentEditor
          key={page.key}
          page={page}
          slots={slots}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
