import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/portal/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { FiltersSheet } from "@/components/filters-sheet";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { LinkPendingPulse } from "@/components/link-pending";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  buildHref,
  escapeLikePattern,
  PAGE_SIZE,
  pageRange,
  parsePage,
  parsePerPage,
  quoteOrValue,
  totalPagesFor,
} from "@/lib/pagination";
import { formatInstantDate } from "@/lib/format";
import { ArtworkSubmissionStatusBadge } from "./submission-badges";
import { ArtworkSubmissionReviewSheet } from "./submission-review-sheet";
import { signArtworkImages } from "./signed-images";
import {
  ARTWORK_SUBMISSION_STATUSES,
  SUBMISSION_PARAM,
  type ArtworkSubmission,
  type ArtworkSubmissionStatus,
  type SignedArtworkImage,
} from "./submission-types";

export const metadata: Metadata = {
  title: "Artwork Submissions",
};

const SELECT =
  "id, submitter_name, submitter_email, credit_name, portfolio_url, consented_at, title, medium, artist_statement, status, review_notes, reviewed_at, created_at, call:event_artwork_calls(id, title), event:events(id, name), images:artwork_submission_images(id, storage_path, thumb_path, content_type, byte_size, position)";

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

function isStatus(value: string | undefined): value is ArtworkSubmissionStatus {
  return (
    !!value &&
    (ARTWORK_SUBMISSION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Supabase returns an embedded to-one relationship as an object in the API but
 * types it as an array; images come back unordered. Both are normalized here
 * so nothing downstream has to know.
 */
function normalize(row: unknown): ArtworkSubmission {
  const record = row as ArtworkSubmission & {
    event: ArtworkSubmission["event"] | ArtworkSubmission["event"][];
    call: ArtworkSubmission["call"] | ArtworkSubmission["call"][];
  };
  const event = Array.isArray(record.event)
    ? (record.event[0] ?? null)
    : record.event;
  const call = Array.isArray(record.call)
    ? (record.call[0] ?? null)
    : record.call;
  return {
    ...record,
    event,
    call,
    images: [...(record.images ?? [])].sort((a, b) => a.position - b.position),
  };
}

export default async function ArtworkSubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerClient();
  const permissions = await getCurrentUserPermissions(supabase);
  const canManage = hasPermission(permissions, "artwork_submissions", "manage");

  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = raw("search") || "";
  const statusRaw = raw("status");
  const statusFilter: ArtworkSubmissionStatus | "all" = isStatus(statusRaw)
    ? statusRaw
    : "all";

  const page = parsePage(raw("page"));
  const perPage = parsePerPage(raw("perPage"));

  let query = supabase
    .from("artwork_submissions")
    .select(SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (search) {
    const pattern = quoteOrValue(`%${escapeLikePattern(search)}%`);
    query = query.or(
      `submitter_name.ilike.${pattern},submitter_email.ilike.${pattern},title.ilike.${pattern}`,
    );
  }
  if (statusFilter !== "all") query = query.eq("status", statusFilter);

  const { offset, to } = pageRange(page, perPage);
  const { data, error, count } = await query.range(offset, to);
  const submissions = (data ?? []).map(normalize);

  // The notification email links straight at one submission, which will not be
  // on the page the link lands on for anything but the newest few. Fetch it on
  // its own when it is missing and render a triggerless sheet, so the link
  // opens what it says it opens. RLS still decides whether it comes back.
  const linkedId = raw(SUBMISSION_PARAM);
  let linked: ArtworkSubmission | null = null;
  if (linkedId && !submissions.some((row) => row.id === linkedId)) {
    // Errors ignored on purpose, including the 22P02 a mangled id produces: a
    // link that no longer resolves leaves the reader on the ordinary list.
    const { data: linkedRow } = await supabase
      .from("artwork_submissions")
      .select(SELECT)
      .eq("id", linkedId)
      .maybeSingle();
    linked = linkedRow ? normalize(linkedRow) : null;
  }

  // One signing round trip for the whole page, including the deep-linked row.
  const signed = await signArtworkImages(
    supabase,
    [...submissions, ...(linked ? [linked] : [])].flatMap((row) => row.images),
  );
  const imagesFor = (row: ArtworkSubmission): SignedArtworkImage[] =>
    row.images
      .map((image) => signed.get(image.id))
      .filter((image): image is SignedArtworkImage => !!image);

  const filterParams = new URLSearchParams();
  if (search) filterParams.set("search", search);
  if (statusFilter !== "all") filterParams.set("status", statusFilter);
  if (perPage !== PAGE_SIZE) filterParams.set("perPage", String(perPage));

  const pageHref = (nextPage: number) =>
    buildHref("/portal/artwork", filterParams, { page: nextPage });
  const perPageHref = (nextPerPage: number) =>
    buildHref("/portal/artwork", filterParams, {
      perPage: nextPerPage,
      page: 1,
    });

  const totalPages = totalPagesFor(count, perPage);
  const hasActiveFilters = !!search || statusFilter !== "all";
  const activeFilterCount = [!!search, statusFilter !== "all"].filter(
    Boolean,
  ).length;

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Artwork
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
      <p className="app-muted mt-2 max-w-2xl text-sm">
        Community artwork submitted through an open call, ready to review for
        the zine.
      </p>

      <div className="mt-6 space-y-4">
        {error ? (
          <p className="app-muted px-4 py-6 text-sm">
            Could not load artwork submissions. Please try again.
          </p>
        ) : (
          <>
            <div className="rainbow-surface flex flex-wrap items-center justify-end gap-2 rounded-xl border border-[var(--line)] p-4 shadow-md">
              {canManage && (
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href="/portal/artwork/calls" />}
                >
                  <LinkPendingPulse>Manage calls</LinkPendingPulse>
                </Button>
              )}
              <FiltersSheet activeCount={activeFilterCount}>
                <form method="get" className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="search"
                      className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                    >
                      Search
                    </label>
                    <Input
                      id="search"
                      name="search"
                      placeholder="Search artist, email or title..."
                      defaultValue={search}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="status"
                      className="app-muted text-xs font-semibold uppercase tracking-[0.1em]"
                    >
                      Status
                    </label>
                    <select
                      id="status"
                      name="status"
                      defaultValue={statusFilter}
                      className={selectClassName}
                    >
                      <option value="all">All statuses</option>
                      {ARTWORK_SUBMISSION_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <FilterSubmitButton />
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        nativeButton={false}
                        render={<Link href="/portal/artwork" />}
                      >
                        <LinkPendingPulse>Clear</LinkPendingPulse>
                      </Button>
                    )}
                  </div>
                </form>
              </FiltersSheet>
            </div>

            {submissions.length === 0 ? (
              <Card>
                <CardContent className="px-0">
                  <EmptyState
                    title={
                      hasActiveFilters
                        ? "No submissions match your filters"
                        : "No artwork yet"
                    }
                    description={
                      hasActiveFilters
                        ? "Clear or loosen the filters to see more."
                        : "Open a call for artwork on an event, then share its link. Submissions appear here as they arrive."
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              // A grid rather than a table: what a curator is deciding on is
              // the picture, and a row of filenames tells them nothing.
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {submissions.map((submission) => {
                  const images = imagesFor(submission);
                  const cover = images[0];
                  const label =
                    submission.title ||
                    `Untitled, ${submission.submitter_name}`;
                  return (
                    <li key={submission.id}>
                      <Card className="h-full overflow-hidden">
                        <div className="relative aspect-square bg-muted">
                          {cover?.thumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- a signed URL whose token rotates hourly; see signed-images.ts
                            <img
                              src={cover.thumbUrl}
                              alt={label}
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="app-muted flex size-full items-center justify-center p-3 text-center text-xs">
                              Preview unavailable
                            </div>
                          )}
                          {images.length > 1 && (
                            <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
                              {images.length}
                            </span>
                          )}
                        </div>
                        <CardContent className="flex flex-col gap-1 p-3">
                          <p className="truncate text-sm font-medium">
                            {submission.title || "Untitled"}
                          </p>
                          <p className="app-muted truncate text-xs">
                            {submission.submitter_name}
                          </p>
                          <p className="app-muted truncate text-xs">
                            {formatInstantDate(submission.created_at)}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <ArtworkSubmissionStatusBadge
                              status={submission.status}
                            />
                            <ArtworkSubmissionReviewSheet
                              submission={submission}
                              images={images}
                              canManage={canManage}
                              defaultOpen={submission.id === linkedId}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}

            {linked ? (
              <ArtworkSubmissionReviewSheet
                submission={linked}
                images={imagesFor(linked)}
                canManage={canManage}
                defaultOpen
                withTrigger={false}
              />
            ) : null}

            {submissions.length > 0 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                count={count}
                pageSize={perPage}
                hrefFor={pageHref}
                perPageHrefFor={perPageHref}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
