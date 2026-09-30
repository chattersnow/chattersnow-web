import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadIcon,
  EyeOffIcon,
  PrinterIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSite, publicTitle } from "@/lib/public-site";
import {
  getPublicPublication,
  getPublicPublications,
  getPublicationPreview,
} from "@/lib/public-publications";
import { adjacentIssues, formatFileSize } from "@/lib/publications";
import { formatCalendarDate } from "@/lib/format";
import { IssueReader } from "./issue-reader";

type PageProps = { params: Promise<{ slug: string }> };

/**
 * The published issue, or -- for the tenant's own editors only -- the draft
 * at this address (#1472). `preview` is what the page marks it with.
 */
async function readIssue(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  slug: string,
) {
  const published = await getPublicPublication(supabase, slug);
  if (published) return { issue: published, preview: false };
  const draft = await getPublicationPreview(supabase, slug);
  return { issue: draft, preview: draft !== null };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const supabase = await createSupabaseServerClient();
  const [{ issue, preview }, site] = await Promise.all([
    readIssue(supabase, (await params).slug),
    getPublicSite(supabase),
  ]);
  return {
    title: publicTitle(site, issue?.title ?? site.lexicon.publication_plural),
    description: issue?.blurb ?? undefined,
    // A draft is at a real address; it must not be indexed from there.
    ...(preview ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * One issue (#1471): its pages as a vertical scroll of images, each with alt
 * text and a transcript. The transcript is the page's real-text equivalent
 * (WCAG 1.1.1, 1.4.5) and what search engines index, so it is in the HTML
 * rather than fetched when opened.
 *
 * The text around the pages keeps a reading measure; the pages themselves are
 * `IssueReader`'s (#1473), which widens them for facing-page spreads.
 */
export default async function PublicationIssuePage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ issue, preview }, issues, { lexicon, content }] = await Promise.all([
    readIssue(supabase, slug),
    getPublicPublications(supabase),
    getPublicSite(supabase),
  ]);
  if (!issue) notFound();

  const { newer, older } = adjacentIssues(issues, issue.slug);
  const email = content.text("org.email_general");
  const printInstructions = content.paragraphs(
    "publications.print_instructions",
  );
  const dateline = [
    issue.seasonLabel,
    issue.publishDate ? formatCalendarDate(issue.publishDate) : null,
  ].filter(Boolean);

  return (
    <article>
      <div className="mx-auto max-w-3xl">
        {preview && (
          <Alert className="mb-6">
            <EyeOffIcon />
            <AlertDescription>
              A draft preview. Only people who can edit{" "}
              {lexicon.publication_plural.toLowerCase()} see this page; publish
              the issue in the portal to put it on the site.
            </AlertDescription>
          </Alert>
        )}
        <Link
          href="/publications"
          className="app-muted inline-flex items-center gap-1 text-sm hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
          {lexicon.publication_plural}
        </Link>

        <header className="mt-4">
          <div className="rainbow-accent w-24" />
          <h1 className="brand-display mt-4 text-3xl font-semibold tracking-brand break-words sm:text-5xl">
            {issue.title}
          </h1>
          {dateline.length > 0 && (
            <p className="app-muted mt-3 text-sm">{dateline.join(" · ")}</p>
          )}
          {issue.blurb && (
            <p className="mt-4 text-base leading-relaxed break-words">
              {issue.blurb}
            </p>
          )}

          {(issue.readingPdf || issue.printPdf) && (
            <div className="mt-6 flex flex-wrap gap-3">
              {issue.readingPdf && (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={issue.readingPdf.url} download />}
                >
                  <DownloadIcon aria-hidden="true" />
                  Download PDF ({formatFileSize(issue.readingPdf.bytes)})
                </Button>
              )}
              {issue.printPdf && (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={issue.printPdf.url} download />}
                >
                  <PrinterIcon aria-hidden="true" />
                  Print at home ({formatFileSize(issue.printPdf.bytes)})
                </Button>
              )}
            </div>
          )}
          {issue.printPdf && printInstructions.length > 0 && (
            <details className="mt-4 rounded-lg border border-[var(--line)]">
              <summary className="cursor-pointer rounded-lg px-4 py-3 text-sm font-medium hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                How to fold the printed copy
              </summary>
              <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed break-words">
                {printInstructions.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </details>
          )}
        </header>
      </div>

      {issue.pages.length > 0 ? (
        <IssueReader title={issue.title} pages={issue.pages} />
      ) : (
        <p className="app-muted mx-auto mt-10 max-w-3xl text-sm italic">
          The pages of this issue are not up yet.
        </p>
      )}

      <div className="mx-auto max-w-3xl">
        <p className="app-muted mt-12 text-sm leading-relaxed">
          Need this {lexicon.publication.toLowerCase()} in another format, such
          as large print or plain text?{" "}
          {email ? (
            <>
              Email{" "}
              <a
                href={`mailto:${email}`}
                className="break-all underline underline-offset-4 hover:text-foreground"
              >
                {email}
              </a>{" "}
              and we will send it to you.
            </>
          ) : (
            <>Contact us and we will send it to you.</>
          )}
        </p>

        {(newer || older) && (
          <nav
            aria-label={`More ${lexicon.publication_plural.toLowerCase()}`}
            className="mt-10 grid gap-4 border-t border-[var(--line)] pt-6 sm:grid-cols-2"
          >
            {older ? (
              <Link
                href={`/publications/${older.slug}`}
                className="group min-w-0 rounded-lg p-2 -m-2 hover:bg-muted/50"
              >
                <span className="app-muted inline-flex items-center gap-1 text-xs">
                  <ArrowLeftIcon className="size-3" aria-hidden="true" />
                  Previous issue
                </span>
                <span className="mt-1 block font-medium break-words group-hover:underline">
                  {older.title}
                </span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {newer && (
              <Link
                href={`/publications/${newer.slug}`}
                className="group min-w-0 rounded-lg p-2 -m-2 hover:bg-muted/50 sm:text-right"
              >
                <span className="app-muted inline-flex items-center gap-1 text-xs">
                  Next issue
                  <ArrowRightIcon className="size-3" aria-hidden="true" />
                </span>
                <span className="mt-1 block font-medium break-words group-hover:underline">
                  {newer.title}
                </span>
              </Link>
            )}
          </nav>
        )}
      </div>
    </article>
  );
}
