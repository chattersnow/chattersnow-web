import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { legalPlainText } from "@/lib/legal-markup";
import { RETENTION_POLICIES } from "@/lib/retention";
import {
  contentSlot,
  isValidSlotValue,
  type LegalDocumentContent,
} from "@/lib/site-content";

/**
 * Chatter Snow's own legal documents, seeded as `site_content` rows by
 * `20260909020000_chatter_snow_owns_its_legal_documents.sql` (#858).
 *
 * A migration is not typechecked and, being scoped `where slug =
 * 'chatter-snow'`, is a no-op on every database CI has, so a malformed document
 * in it would reach the one database it does apply to unchallenged: the rows
 * would insert, `resolveSiteContent` would drop them as invalid, and
 * chattersnow.org would quietly serve the platform's document instead of its
 * own. This parses what the migration actually inserts.
 */
const MIGRATION = join(
  import.meta.dirname,
  "..",
  "..",
  "supabase",
  "migrations",
  "20260909020000_chatter_snow_owns_its_legal_documents.sql",
);

/** The `('<key>', $doc$<json>$doc$)` rows the migration inserts. */
function seededDocuments(): Map<string, LegalDocumentContent> {
  const sql = readFileSync(MIGRATION, "utf8");
  const entries = new Map<string, LegalDocumentContent>();
  const row = /\('(legal\.[a-z_]+)', \$doc\$([\s\S]*?)\$doc\$\)/g;
  for (let match = row.exec(sql); match; match = row.exec(sql)) {
    entries.set(match[1], JSON.parse(match[2]) as LegalDocumentContent);
  }
  return entries;
}

/** Everything a reader sees, with the markup markers taken back off. */
function readable(doc: LegalDocumentContent): string {
  return legalPlainText([
    ...doc.summary,
    ...doc.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
    ]),
  ]);
}

const SECTION_IDS: Record<string, string[]> = {
  "legal.privacy": [
    "what-we-collect",
    "what-we-dont-do",
    "how-long-we-keep-it",
    "who-can-see-it",
    "how-we-protect-it",
    "cookies-and-analytics",
    "other-sites",
    "your-choices",
    "minors",
    "changes",
    "contact",
  ],
  // The sections that are Chatter Snow's and no longer the platform's:
  // snow-sports-risks, gear-library and governing-law here, and
  // bringing-a-minor and on-the-mountain in the code of conduct.
  "legal.terms": [
    "who-we-are",
    "using-this-site",
    "events-and-programs",
    "snow-sports-risks",
    "gear-library",
    "volunteering",
    "accessibility-and-inclusion",
    "educational-content",
    "donations-and-payments",
    "photos-and-content",
    "other-sites-and-venues",
    "other-agreements",
    "no-warranties",
    "limitation-of-liability",
    "indemnification",
    "changes",
    "governing-law",
    "severability",
    "contact",
  ],
  "legal.code_of_conduct": [
    "what-we-expect",
    "bringing-a-minor",
    "on-the-mountain",
    "what-isnt-tolerated",
    "reporting-a-problem",
    "how-we-handle-a-report",
    "if-you-disagree",
    "questions",
  ],
};

describe("Chatter Snow's seeded legal documents", () => {
  const documents = seededDocuments();

  test("the migration seeds all three", () => {
    expect([...documents.keys()].sort()).toEqual([
      "legal.code_of_conduct",
      "legal.privacy",
      "legal.terms",
    ]);
  });

  for (const [key, expectedIds] of Object.entries(SECTION_IDS)) {
    describe(key, () => {
      test("is a valid value for its slot", () => {
        expect(isValidSlotValue(contentSlot(key)!, documents.get(key))).toBe(
          true,
        );
      });

      test("carries the sections the published page had", () => {
        expect(documents.get(key)!.sections.map((s) => s.id)).toEqual(
          expectedIds,
        );
      });

      test("every section has prose, and every link is publishable", () => {
        const doc = documents.get(key)!;
        for (const section of doc.sections) {
          expect(section.paragraphs.length, `${section.id}`).toBeGreaterThan(0);
        }
        // A link the markup parser rejects renders as its own source text --
        // "[team page](/about/team)" on a legal page, in front of visitors.
        expect(readable(doc)).not.toMatch(/\]\(|\*\*/);
      });

      test("names Chatter Snow and its own addresses", () => {
        expect(readable(documents.get(key)!)).toMatch(
          /Chatter|chattersnow\.org/,
        );
      });
    });
  }

  // Once this text is a row rather than a render of `RETENTION_POLICIES`,
  // nothing else stops a period changing in code while the published page keeps
  // promising the old one -- the failure #602 exists to prevent, one layer down.
  // Changing a period means a follow-up migration against this row.
  test("the privacy policy publishes every enforced retention period", () => {
    const text = readable(documents.get("legal.privacy")!);
    for (const policy of RETENTION_POLICIES) {
      expect(text, `${policy.key} is not published`).toContain(policy.howLong);
      expect(text).toContain(policy.what);
    }
  });
});
