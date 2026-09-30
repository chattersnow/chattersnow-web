"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff, Plus } from "lucide-react";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { StatusBadge } from "@/components/portal/status-badge";
import { useActionToast } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useLexicon } from "@/components/lexicon-context";
import { formatCalendarDate } from "@/lib/format";
import {
  PUBLICATION_SLUG_MAX,
  publicationSlugify,
  suggestPublicationSlug,
} from "@/lib/publications";
import { createPublicationAction } from "./actions";
import { PUBLICATIONS_PATH } from "./publication-shared";

export type IssueListEntry = {
  id: string;
  slug: string;
  title: string;
  seasonLabel: string | null;
  publishDate: string | null;
  status: "draft" | "published";
  pages: number;
  /** Pages still lacking alt text or a transcript. */
  missing: number;
};

/**
 * Every issue of the tenant's publication (#1472), newest first, and the form
 * that starts a new one. Each issue is one object edited on its own page, so
 * there is nothing here to tab between (docs/portal-navigation.md).
 */
export function IssueList({
  issues,
  canEdit,
  sectionHidden,
}: {
  issues: readonly IssueListEntry[];
  canEdit: boolean;
  sectionHidden: boolean;
}) {
  const router = useRouter();
  const lexicon = useLexicon();
  const heading = lexicon.publication_plural;
  const [title, setTitle] = useState("");
  const [seasonLabel, setSeasonLabel] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const { isPending, run } = useActionToast();

  const suggested = suggestPublicationSlug(seasonLabel, publishDate);
  const effectiveSlug = slugEdited
    ? slug
    : suggested || publicationSlugify(title);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () =>
        createPublicationAction({
          title,
          slug: effectiveSlug,
          seasonLabel,
          publishDate,
        }),
      {
        success: `${title} created as a draft.`,
        onSuccess: (result) => router.push(`${PUBLICATIONS_PATH}/${result.id}`),
      },
    );
  }

  return (
    <>
      <PortalBreadcrumbs current={heading} />

      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          {heading}
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <p className="app-muted mt-6 max-w-3xl text-sm leading-relaxed">
        Each issue is a page at <code>/publications/&lt;address&gt;</code>: its
        pages as images, each with alt text and a transcript, and optional PDFs
        to download or print. An issue stays a draft, visible only to editors,
        until you publish it.
      </p>

      {sectionHidden && (
        <Alert className="mt-6 max-w-3xl">
          <EyeOff />
          <AlertDescription>
            The {heading} section is switched off, so no issue is reachable on
            the public site yet, published or not. Turn it on in{" "}
            <Link
              href="/portal/website/page-visibility"
              className="underline underline-offset-4"
            >
              Page visibility
            </Link>{" "}
            once an issue is published.
          </AlertDescription>
        </Alert>
      )}

      {canEdit && (
        <Card className="mt-6 max-w-3xl">
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreate}>
              <RequiredFieldsNote />
              <Field>
                <FieldLabel htmlFor="new-issue-title" required>
                  New issue
                </FieldLabel>
                <Input
                  id="new-issue-title"
                  value={title}
                  placeholder="The First Snow Issue"
                  required
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="new-issue-season">Season</FieldLabel>
                  <Input
                    id="new-issue-season"
                    value={seasonLabel}
                    placeholder="Fall 2026"
                    onChange={(event) => setSeasonLabel(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-issue-date">Publish date</FieldLabel>
                  <Input
                    id="new-issue-date"
                    type="date"
                    value={publishDate}
                    onChange={(event) => setPublishDate(event.target.value)}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="new-issue-slug" required>
                  Web address
                </FieldLabel>
                <Input
                  id="new-issue-slug"
                  value={effectiveSlug}
                  placeholder="fall-2026"
                  maxLength={PUBLICATION_SLUG_MAX}
                  required
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(publicationSlugify(event.target.value));
                  }}
                />
                <FieldDescription>
                  The issue will be at /publications/{effectiveSlug || "…"}.
                  Printed copies and QR codes carry it, so it cannot change once
                  the issue is published.
                </FieldDescription>
              </Field>
              <Button
                type="submit"
                size="sm"
                disabled={isPending || !title.trim() || !effectiveSlug}
              >
                {isPending ? <Spinner /> : <Plus />}
                Add issue
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 max-w-3xl space-y-3">
        {issues.length === 0 && (
          <p className="app-muted text-sm italic">
            No issues yet. The public {heading} page lists nothing until one is
            published.
          </p>
        )}

        {issues.map((issue) => {
          const dateline = [
            issue.seasonLabel,
            issue.publishDate ? formatCalendarDate(issue.publishDate) : null,
          ].filter(Boolean);
          return (
            <Card key={issue.id}>
              <CardContent className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`${PUBLICATIONS_PATH}/${issue.id}`}
                    className="min-w-0 font-medium break-words underline underline-offset-4"
                  >
                    {issue.title}
                  </Link>
                  <StatusBadge
                    tone={issue.status === "published" ? "success" : "neutral"}
                  >
                    {issue.status === "published" ? "Published" : "Draft"}
                  </StatusBadge>
                </div>
                <p className="app-muted text-sm break-words">
                  {[
                    `/publications/${issue.slug}`,
                    ...dateline,
                    `${issue.pages} ${issue.pages === 1 ? "page" : "pages"}`,
                  ].join(" · ")}
                </p>
                {issue.missing > 0 && (
                  <p className="app-muted text-xs">
                    {issue.missing} {issue.missing === 1 ? "page" : "pages"}{" "}
                    still {issue.missing === 1 ? "needs" : "need"} alt text or a
                    transcript.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
