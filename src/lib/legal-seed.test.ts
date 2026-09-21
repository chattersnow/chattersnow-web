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
  // Changing a period means a follow-up migration against this row, which is
  // why the document is read here *after* those migrations rather than as
  // 20260909020000 seeded it.
  //
  // "Every period" means every period this document's own forms can produce
  // (#1291, #1296), not every rule the purge enforces. Chatter Snow has no
  // constituent area -- `constituent_accounts` is the one module seeded
  // `default_enabled = false` -- so publishing a clock for accounts, claims or
  // self-logged hours would be the thing #1291 removed from the platform
  // default, one layer down again. Turning that area on makes this document
  // stale, which is what #1292's surface fingerprint reports.
  test("the privacy policy publishes every enforced retention period", () => {
    const text = readable(publishedPrivacy());
    for (const policy of RETENTION_POLICIES) {
      if (policy.surface && !SEEDED_SURFACES.has(policy.surface)) {
        expect(text, `${policy.key} is published anyway`).not.toContain(
          policy.what,
        );
        continue;
      }
      expect(text, `${policy.key} is not published`).toContain(policy.howLong);
      expect(text).toContain(policy.what);
    }
  });
});

/** The collection surfaces Chatter Snow's seeded document describes. */
const SEEDED_SURFACES: ReadonlySet<string> = new Set([
  "contact",
  "volunteerApplications",
  "eventRegistrations",
  "gearRequests",
]);

const PORTAL_ACCOUNTS_MIGRATION = join(
  import.meta.dirname,
  "..",
  "..",
  "supabase",
  "migrations",
  "20260919050000_privacy_policy_portal_accounts_name_the_role.sql",
);

/** The `$tag$...$tag$` body a guarded content migration quotes its text in. */
function dollarQuoted(sql: string, tag: string): string | undefined {
  return new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`).exec(sql)?.[1];
}

/** The seeded document with every later content migration applied to it. */
function publishedPrivacy(): LegalDocumentContent {
  const sql = readFileSync(PORTAL_ACCOUNTS_MIGRATION, "utf8");
  const before = dollarQuoted(sql, "old")!;
  const after = dollarQuoted(sql, "new")!;
  const seeded = JSON.stringify(seededDocuments().get("legal.privacy")!);
  return JSON.parse(
    seeded.replace(
      JSON.stringify(before).slice(1, -1),
      JSON.stringify(after).slice(1, -1),
    ),
  ) as LegalDocumentContent;
}

/**
 * The follow-up that names the population the Portal accounts clock is about
 * (#1296).
 *
 * The same silent failure mode the Resend migration below has, checked the same
 * way: the `where` clause quotes the seeded bullet list slightly differently,
 * matches nothing, and the deploy reports success while the page still says
 * what it said. This one has a second: the replacement has to be the bullet
 * list with one clause changed, because a retention bullet lost here is a
 * period the page stops publishing while the purge keeps enforcing it.
 */
describe("naming the role in the Portal accounts clock", () => {
  const sql = readFileSync(PORTAL_ACCOUNTS_MIGRATION, "utf8");
  const before = dollarQuoted(sql, "old");
  const after = dollarQuoted(sql, "new");
  const seeded = seededDocuments().get("legal.privacy")!;
  const bullets = seeded.sections
    .find((section) => section.id === "how-long-we-keep-it")!
    .paragraphs.find((paragraph) => paragraph.includes("**Portal accounts**"));

  test("guards on the bullet list the seed migration wrote", () => {
    expect(before).toBeDefined();
    expect(before).toBe(bullets);
  });

  // 20260909030000 moved it, so this migration has to guard on where that one
  // left it rather than on where the seed did.
  test("guards on the date the previous content migration left", () => {
    expect(sql).toContain("'September 9, 2026'");
  });

  test("moves the date, because published text changed", () => {
    const updated = /to_jsonb\('([^']+)'::text\)\s*\)/.exec(sql)?.[1];
    expect(updated).toBeDefined();
    expect(updated).not.toBe(seeded.last_updated);
    expect(updated).not.toBe("September 9, 2026");
  });

  test("changes one clause and no period", () => {
    const removed = before!
      .split("\n")
      .filter((line) => !after!.split("\n").includes(line));
    const added = after!
      .split("\n")
      .filter((line) => !before!.split("\n").includes(line));
    expect(removed).toHaveLength(1);
    expect(added).toHaveLength(1);
    expect(removed[0]).toContain("**Portal accounts**");
    expect(added[0]).toContain("**Portal accounts**");
  });

  // The whole point of the change: a reader could not tell which of the two
  // account clocks covered them.
  test("says whose accounts the clock is about", () => {
    expect(after).toContain("If you hold a role with us");
  });

  test("the replacement is markup the parser can publish", () => {
    expect(legalPlainText([after!])).not.toMatch(/\]\(|\*\*/);
  });

  test("the document it produces is still valid for its slot", () => {
    expect(
      isValidSlotValue(contentSlot("legal.privacy")!, publishedPrivacy()),
    ).toBe(true);
  });
});

/**
 * The follow-up that adds Resend to the privacy policy's subprocessor list
 * (#864).
 *
 * A guarded content migration has one silent failure mode: the `where` clause
 * quotes the old text slightly differently from the row -- one wrong dash, one
 * missing bullet -- matches nothing, and the deploy reports success while the
 * page still says what it said. Nothing else catches that, because the
 * migration is scoped to a tenant no CI database has. This holds the guard
 * against the text 20260909020000 actually seeds, and checks the replacement is
 * the same list with one processor added.
 */
const RESEND_MIGRATION = join(
  import.meta.dirname,
  "..",
  "..",
  "supabase",
  "migrations",
  "20260909030000_privacy_policy_names_resend.sql",
);

describe("adding Resend to the subprocessor list", () => {
  const sql = readFileSync(RESEND_MIGRATION, "utf8");
  const dollarQuoted = (tag: string) =>
    new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`).exec(sql)?.[1];

  const before = dollarQuoted("old");
  const after = dollarQuoted("new");
  const seeded = seededDocuments().get("legal.privacy")!;
  const providers = seeded.sections
    .find((section) => section.id === "who-can-see-it")!
    .paragraphs.find((paragraph) => paragraph.includes("**Supabase**"));

  test("guards on the paragraph the seed migration wrote", () => {
    expect(before).toBeDefined();
    expect(before).toBe(providers);
  });

  test("guards on the date the seed migration wrote", () => {
    expect(sql).toContain(`'${seeded.last_updated}'`);
  });

  test("moves the date, because a subprocessor was added", () => {
    const updated = /to_jsonb\('([^']+)'::text\)\s*\)/.exec(sql)?.[1];
    expect(updated).toBeDefined();
    expect(updated).not.toBe(seeded.last_updated);
  });

  test("adds Resend and changes nothing else", () => {
    expect(after).toContain("**Resend**");
    const removed = before!
      .split("\n")
      .filter((line) => !after!.split("\n").includes(line));
    const added = after!
      .split("\n")
      .filter((line) => !before!.split("\n").includes(line));
    expect(removed).toEqual([]);
    expect(added).toHaveLength(1);
  });

  test("the replacement is markup the parser can publish", () => {
    expect(legalPlainText([after!])).not.toMatch(/\]\(|\*\*/);
  });

  test("the document it produces is still valid for its slot", () => {
    const published: LegalDocumentContent = JSON.parse(
      JSON.stringify(seeded).replace(
        JSON.stringify(before).slice(1, -1),
        JSON.stringify(after).slice(1, -1),
      ),
    );
    expect(isValidSlotValue(contentSlot("legal.privacy")!, published)).toBe(
      true,
    );
    expect(readable(published)).toContain("Resend");
  });
});
