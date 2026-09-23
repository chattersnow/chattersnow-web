import Link from "next/link";
import {
  LegalDocumentSections,
  LegalDocumentSummary,
} from "@/components/legal-document";
import type { LegalDocumentContent } from "@/lib/site-content";
import { EventWaiverFullText } from "./event-waiver-full-text";

/**
 * The organization's participant agreement where it is accepted: its title,
 * its own summary, and the full text one tap away in a sheet (#686, #1402).
 *
 * #686 put the whole document inline, in a capped scroll box, so that "did
 * they see it" was answerable. #1402 reversed that on the platform owner's
 * decision: a scroll box inside a scrolling page takes over the finger on a
 * phone and shows a few lines at a time, and it is not the stronger pattern
 * in court either -- *Sgouros v. TransUnion* refused terms in a small box
 * nothing prompted the reader to scroll. What courts have upheld is a
 * conspicuous way to the full text beside an affirmative act naming the
 * document, which is the button here and the box the form puts under it.
 * docs/legal-basis.md records the decision and the cases.
 *
 * The summary is the tenant's own `summary` paragraphs, in the tenant's
 * words; the platform writes none of it. A tenant that has written none shows
 * the title and the button, and the full text is no further away for it.
 *
 * Rendered on the server and passed into the client form as a prop, which
 * keeps `parseLegalBlocks` and a whole legal document out of the browser
 * bundle for the many tenants that have no waiver at all. The sheet's body is
 * rendered here too and handed to the client trigger as children.
 *
 * What is displayed is the *version's* content rather than the live site
 * content row. They agree today; the day somebody republishes between this
 * render and the submit, the two disagree -- and the RPC refuses that
 * registration rather than record acceptance of text nobody read.
 */
export function EventWaiver({
  doc,
  version,
  headingId,
}: {
  doc: LegalDocumentContent;
  version: number;
  headingId: string;
}) {
  const summary =
    doc.summary.length > 0 ? (
      <div className="app-muted space-y-3 text-sm leading-relaxed">
        <LegalDocumentSummary paragraphs={doc.summary} />
      </div>
    ) : null;

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-3 rounded-md border border-[var(--line)] p-4"
    >
      <h3 id={headingId} className="text-sm font-semibold">
        {doc.title}
      </h3>
      {summary}
      <EventWaiverFullText
        title={doc.title}
        version={version}
        lastUpdated={doc.last_updated}
      >
        {summary}
        {/* h3 under the sheet's own h2 title. No anchors: the ids belong to
            /waiver's section rail. */}
        <LegalDocumentSections doc={doc} headingLevel={3} anchors={false} />
      </EventWaiverFullText>
      <p className="app-muted text-xs">
        Version {version} · last updated {doc.last_updated} ·{" "}
        <Link
          href={`/waiver?version=${version}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground underline underline-offset-4"
        >
          open this version in a new tab
        </Link>
      </p>
    </section>
  );
}
