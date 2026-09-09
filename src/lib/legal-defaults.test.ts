import { describe, expect, test } from "bun:test";
import {
  platformLegalDescription,
  platformLegalDocument,
  PLATFORM_LEGAL_SLOT_KEYS,
  type LegalOrgContext,
} from "@/lib/legal-defaults";
import {
  legalPlainText,
  parseLegalBlocks,
  type InlineRun,
} from "@/lib/legal-markup";
import { RETENTION_POLICIES } from "@/lib/retention";
import { isValidSlotValue, contentSlot } from "@/lib/site-content";

const ORG: LegalOrgContext = {
  name: "Riverside Trails",
  emailGeneral: "hello@riverside.example",
  emailPrivacy: "privacy@riverside.example",
  emailConduct: "conduct@riverside.example",
};

/** Everything a reader sees, with the markup markers taken back off. */
function readable(slotKey: string): string {
  const doc = platformLegalDocument(slotKey, ORG);
  return legalPlainText([
    ...doc.summary,
    ...doc.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
    ]),
  ]);
}

/** Every link a document publishes. */
function hrefs(doc: {
  summary: string[];
  sections: { paragraphs: string[] }[];
}) {
  const found: string[] = [];
  const walk = (runs: readonly InlineRun[]) => {
    for (const run of runs) {
      if (run.kind === "link") found.push(run.href);
      if (run.kind !== "text") walk(run.runs);
    }
  };
  for (const block of parseLegalBlocks([
    ...doc.summary,
    ...doc.sections.flatMap((section) => section.paragraphs),
  ])) {
    if (block.kind === "bullets") block.items.forEach(walk);
    else walk(block.runs);
  }
  return found;
}

describe("the platform's legal documents", () => {
  test("there is one for each legal.* slot", () => {
    expect([...PLATFORM_LEGAL_SLOT_KEYS].sort()).toEqual([
      "legal.code_of_conduct",
      "legal.privacy",
      "legal.terms",
    ]);
  });

  for (const key of PLATFORM_LEGAL_SLOT_KEYS) {
    describe(key, () => {
      test("is a valid value for its slot", () => {
        const slot = contentSlot(key)!;
        expect(isValidSlotValue(slot, platformLegalDocument(key, ORG))).toBe(
          true,
        );
      });

      test("every section has prose and a title", () => {
        const doc = platformLegalDocument(key, ORG);
        expect(doc.sections.length).toBeGreaterThan(0);
        for (const section of doc.sections) {
          expect(section.title, `${section.id} has no title`).not.toBe("");
          expect(
            section.paragraphs.length,
            `${section.id} has no prose`,
          ).toBeGreaterThan(0);
          for (const paragraph of section.paragraphs) {
            expect(
              paragraph.trim(),
              `${section.id} has a blank paragraph`,
            ).not.toBe("");
          }
        }
      });

      // The whole point of #858: a tenant with no documents of its own must not
      // be served another organization's, and must not be served one that
      // describes activities it does not run.
      test("names no organization but this one, and no snow sports", () => {
        const text = readable(key);
        expect(text).toContain(ORG.name);
        expect(text).not.toMatch(
          /chatter|snowboard|\bski\b|skiing|mountain|ski patrol|New Jersey|501\(c\)\(3\)/i,
        );
      });

      test("its description names the organization", () => {
        expect(platformLegalDescription(key, ORG)).toContain(ORG.name);
      });

      // Every public page but these three can be hidden per tenant, so a link
      // to one is a link that may 404. /privacy is the exception #859 keeps
      // served for everyone, and a #fragment stays inside this document.
      test("links only to addresses, to /privacy and within itself", () => {
        const links = hrefs(platformLegalDocument(key, ORG));
        expect(links.length).toBeGreaterThan(0);
        for (const href of links) {
          expect(
            href.startsWith("mailto:") ||
              href.startsWith("#") ||
              href === "/privacy",
            `${href} is not an address, a fragment or /privacy`,
          ).toBe(true);
        }
      });
    });
  }

  test("the addresses published are the tenant's own", () => {
    expect(readable("legal.privacy")).toContain(ORG.emailPrivacy);
    expect(readable("legal.terms")).toContain(ORG.emailGeneral);
    expect(readable("legal.code_of_conduct")).toContain(ORG.emailConduct);
  });

  // The retention section is generated rather than written, so the published
  // periods and the clocks the purge enforces stay one decision (#602).
  test("the privacy policy publishes every enforced retention period", () => {
    const text = readable("legal.privacy");
    for (const policy of RETENTION_POLICIES) {
      expect(text, `${policy.key} is not published`).toContain(policy.howLong);
      expect(text).toContain(policy.what);
    }
  });

  test("an unknown slot is an error, not an empty document", () => {
    expect(() => platformLegalDocument("legal.bylaws", ORG)).toThrow();
  });
});
