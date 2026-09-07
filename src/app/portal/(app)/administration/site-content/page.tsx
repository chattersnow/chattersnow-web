import type { Metadata } from "next";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getPageVisibility } from "@/lib/page-visibility";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CONTENT_PAGES,
  sectionsForPage,
  slotsForPage,
} from "@/lib/site-content";
import { ContentEditor } from "./content-editor";
import {
  buildOutline,
  readSlot,
  resolveDraftAndPublished,
  type EditorSlot,
  type SiteContentDraftRow,
} from "./content-shared";

export const metadata: Metadata = {
  title: "Site Content",
};

/** The people named on this tenant's rows, by id, for the attribution lines. */
async function actorNames(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: readonly SiteContentDraftRow[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      rows
        .flatMap((row) => [row.draft_updated_by, row.published_by])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) return new Map();

  const { data } = await supabase.rpc("list_site_content_actors", {
    p_user_ids: ids,
  });
  const actors = (data ?? []) as {
    user_id: string;
    email: string | null;
    full_name: string | null;
  }[];
  return new Map(
    actors.map((actor) => [
      actor.user_id,
      actor.full_name || actor.email || "someone",
    ]),
  );
}

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
  const [permissions, { data }, visibility] = await Promise.all([
    getCurrentUserPermissions(supabase),
    supabase
      .from("site_content")
      .select(
        "key, value, draft_value, has_draft, draft_updated_at, draft_updated_by, published_at, published_by",
      ),
    getPageVisibility(supabase),
  ]);
  const rows = (data ?? []) as SiteContentDraftRow[];
  const { published, draft } = resolveDraftAndPublished(rows);
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  const draftKeys = new Set(
    rows.filter((row) => row.has_draft).map((row) => row.key),
  );
  const canEdit = hasPermission(permissions, "site_content", "manage");
  const actors = await actorNames(supabase, rows);

  // The editor gets, for every slot on the page, the copy it edits (the draft
  // where there is one) and the copy the public site is serving, so it can
  // show what is about to change and offer "back to default" only where it
  // means something.
  const slots: EditorSlot[] = slotsForPage(page.key).map((slot) => {
    const row = rowsByKey.get(slot.key);
    return {
      slot,
      value: readSlot(slot, draft),
      published: readSlot(slot, published),
      overridden: published.overrides.has(slot.key),
      hasDraft: row?.has_draft ?? false,
      draftUpdatedAt: row?.draft_updated_at ?? null,
      draftUpdatedBy: row?.draft_updated_by
        ? (actors.get(row.draft_updated_by) ?? null)
        : null,
      publishedAt: row?.published_at ?? null,
      publishedBy: row?.published_by
        ? (actors.get(row.published_by) ?? null)
        : null,
    };
  });

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
        The words on the public website, page by page. Saving keeps a draft;
        nothing reaches the public site until you publish it.
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
          outline={buildOutline(draft, published, draftKeys)}
          hiddenPages={hiddenPages}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
