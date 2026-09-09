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
export function LegalDocument({ doc }: { doc: LegalDocumentContent }) {
  return (
    <LegalPageShell
      title={doc.title}
      lastUpdated={doc.last_updated}
      sections={doc.sections}
      summary={<Blocks paragraphs={doc.summary} />}
    >
      {doc.sections.map((section) => (
        <section key={section.id} id={section.id}>
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            {section.title}
          </h2>
          <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
            <Blocks paragraphs={section.paragraphs} />
          </div>
        </section>
      ))}
    </LegalPageShell>
  );
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
