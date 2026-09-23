import type { ReactNode } from "react";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal-page-shell";
import {
  parseLegalBlocks,
  type InlineRun,
  type LegalBlock,
} from "@/lib/legal-markup";
import type { LegalDocumentContent } from "@/lib/site-content";

/**
 * A legal page published as data: the structured document under `legal.*` in
 * site content -- the platform's neutral default (#858) or whatever the tenant
 * has published in its place -- rendered through the same shell, so the rail,
 * the mobile section list and the print layout are identical either way.
 *
 * Prose goes through `parseLegalBlocks`, which is the whole of the markup these
 * documents may carry: bullets, links and bold. Nothing here renders HTML from
 * a stored string.
 */
export function LegalDocument({
  doc,
  dateLabel,
  banner,
  appendix,
}: {
  doc: LegalDocumentContent;
  /** Overrides the "Last updated" label under the title. */
  dateLabel?: string;
  /**
   * Rendered above the title, for the one thing a reader has to know before
   * they start reading: that this is not the document in force (#601).
   */
  banner?: ReactNode;
  /**
   * Rendered after the last section. The document is data and carries only
   * its own text, so anything *about* the document -- which version this is,
   * where the earlier ones are (#1322) -- belongs here rather than in a
   * section somebody could rewrite.
   */
  appendix?: ReactNode;
}) {
  return (
    <LegalPageShell
      title={doc.title}
      banner={banner}
      lastUpdated={doc.last_updated}
      dateLabel={dateLabel}
      sections={doc.sections}
      summary={<Blocks paragraphs={doc.summary} />}
    >
      <LegalDocumentSections doc={doc} />
      {appendix}
    </LegalPageShell>
  );
}

/**
 * The sections of a legal document, without the page around them.
 *
 * Split out for the participant waiver (#686), which is rendered inside the
 * event registration form as well as at its own address: the agreement has to
 * be readable where it is being accepted, not only behind a link. The page
 * keeps its own `h1`, rail and print layout; this is the same prose in a
 * frame the size of a form.
 *
 * The full-text sheet (#1402) is a third frame: its title is the dialog's
 * `h2`, so the sections sit at `h3` there.
 *
 * `headingLevel` and `anchors` both exist because a form is not a page. A
 * document embedded under a form's own heading must not jump a level, and two
 * copies of the same document in one DOM -- or a section id colliding with a
 * control's -- would be a real duplicate-id bug rather than a cosmetic one.
 */
export function LegalDocumentSections({
  doc,
  headingLevel = 2,
  anchors = true,
}: {
  doc: LegalDocumentContent;
  headingLevel?: 2 | 3 | 4;
  anchors?: boolean;
}) {
  const Heading = (["h2", "h3", "h4"] as const)[headingLevel - 2];
  const headingClass =
    headingLevel === 2
      ? "brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl"
      : headingLevel === 3
        ? "text-base font-semibold text-foreground"
        : "text-sm font-medium text-foreground";

  return doc.sections.map((section) => (
    <section key={section.id} id={anchors ? section.id : undefined}>
      <Heading className={headingClass}>{section.title}</Heading>
      <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
        <Blocks paragraphs={section.paragraphs} />
      </div>
    </section>
  ));
}

/** A document's summary paragraphs, for the same embedded case. */
export function LegalDocumentSummary({
  paragraphs,
}: {
  paragraphs: readonly string[];
}) {
  return <Blocks paragraphs={paragraphs} />;
}

function Blocks({ paragraphs }: { paragraphs: readonly string[] }) {
  return parseLegalBlocks(paragraphs).map((block, index) => (
    <Block key={index} block={block} />
  ));
}

function Block({ block }: { block: LegalBlock }) {
  if (block.kind === "bullets") {
    return (
      <ul className="list-disc space-y-2 pl-5">
        {block.items.map((runs, index) => (
          <li key={index}>
            <Runs runs={runs} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p>
      <Runs runs={block.runs} />
    </p>
  );
}

function Runs({ runs }: { runs: readonly InlineRun[] }) {
  return runs.map((run, index) => {
    if (run.kind === "strong") {
      return (
        <strong key={index}>
          <Runs runs={run.runs} />
        </strong>
      );
    }
    if (run.kind === "link") {
      const className = "hover:text-foreground underline underline-offset-4";
      // Site-relative links are client-side navigations; a mailto: address, an
      // external link and a #fragment are not routes, so `next/link` has
      // nothing to prefetch.
      return run.href.startsWith("/") ? (
        <Link key={index} href={run.href} className={className}>
          <Runs runs={run.runs} />
        </Link>
      ) : (
        <a key={index} href={run.href} className={className}>
          <Runs runs={run.runs} />
        </a>
      );
    }
    return <span key={index}>{run.text}</span>;
  });
}
