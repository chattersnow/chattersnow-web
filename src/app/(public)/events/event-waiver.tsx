import Link from "next/link";
import {
  LegalDocumentSections,
  LegalDocumentSummary,
} from "@/components/legal-document";
import type { LegalDocumentContent } from "@/lib/site-content";

/**
 * The organization's participant agreement, rendered in full above the box
 * that accepts it (#686).
 *
 * In full, and not behind a link: the whole point of the record this form
 * writes is that the person was shown the words. A link alone would make
 * "which version did they accept" answerable and "did they see it" not.
 *
 * Rendered on the server and passed into the client form as a prop, which
 * keeps `parseLegalBlocks` and a whole legal document out of the browser
 * bundle for the many tenants that have no waiver at all.
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
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-sm font-medium">
        {doc.title}
      </h3>
      {/*
        A capped, scrollable frame rather than the whole document inline. The
        text is all here -- nothing truncated, nothing fetched on demand -- but
        an agreement runs to a page or more, and pushing the box and the submit
        button below it means a reader on a phone scrolls past the thing they
        are meant to act on.

        `tabIndex` because a scrollable region that cannot be focused cannot be
        scrolled from the keyboard, which is what axe's
        `scrollable-region-focusable` is about; `role="group"` with a name so
        that now-focusable div announces as something rather than as nothing.
      */}
      <div
        role="group"
        aria-labelledby={headingId}
        tabIndex={0}
        className="max-h-80 space-y-4 overflow-y-auto rounded-md border border-[var(--line)] p-4 text-sm leading-relaxed"
      >
        {doc.summary.length > 0 ? (
          <div className="app-muted space-y-4">
            <LegalDocumentSummary paragraphs={doc.summary} />
          </div>
        ) : null}
        {/* h4 under this block's h3, which is the level `event-sponsors.tsx`
            and `rider-profile-form-fields.tsx` already use in this position --
            it reads the same under the page's h1 and under the sheet's h2. No
            anchors: the ids belong to /waiver, and a second copy of them
            inside a form would be a real duplicate. */}
        <LegalDocumentSections doc={doc} headingLevel={4} anchors={false} />
      </div>
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
