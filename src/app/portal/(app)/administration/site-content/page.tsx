import type { Metadata } from "next";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getPageVisibility } from "@/lib/page-visibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CONTENT_PAGES,
  resolveSiteContent,
  sectionsForPage,
  slotsForPage,
  type SiteContentRow,
} from "@/lib/site-content";
import { ContentEditor } from "./content-editor";
import { buildOutline, type EditorSlot } from "./content-shared";

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
  const [permissions, { data: rows }, visibility] = await Promise.all([
    getCurrentUserPermissions(supabase),
    supabase.from("site_content").select("key, value"),
    getPageVisibility(supabase),
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

  // Writing copy for a page nobody can reach is possible and used to give no
  // hint of it; page visibility lives one page over in System Settings (#792).
  const hiddenPages = CONTENT_PAGES.filter(
    (candidate) =>
      candidate.visibilityKey && visibility[candidate.visibilityKey] === false,
  ).map((candidate) => candidate.key);

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

      {/* The page switcher lives inside the editor because leaving it here
          navigated away from unsaved edits without asking (#791). */}
      <div className="mt-6">
        <ContentEditor
          key={page.key}
          page={page}
          pages={CONTENT_PAGES}
          sections={sectionsForPage(page.key)}
          slots={slots}
          // Every page's copy, so the rail can answer "where does this
          // sentence live?" without thirteen round trips.
          outline={buildOutline(content)}
          hiddenPages={hiddenPages}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
