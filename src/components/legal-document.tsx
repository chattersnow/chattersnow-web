import { LegalPageShell } from "@/components/legal-page-shell";
import type { LegalDocumentContent } from "@/lib/site-content";

/**
 * A legal page published as data (#707 Phase 4): the structured document a
 * tenant sets under `legal.*` in site content, rendered through the same
 * shell the platform's own documents use so the rail, the mobile section
 * list and the print layout are identical.
 */
export function LegalDocument({ doc }: { doc: LegalDocumentContent }) {
  return (
    <LegalPageShell
      title={doc.title}
      lastUpdated={doc.last_updated}
      sections={doc.sections}
      summary={doc.summary.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    >
      {doc.sections.map((section) => (
        <section key={section.id} id={section.id}>
          <h2 className="brand-display text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
            {section.title}
          </h2>
          <div className="app-muted mt-4 space-y-4 text-sm leading-relaxed sm:text-base">
            {section.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </section>
      ))}
    </LegalPageShell>
  );
}
