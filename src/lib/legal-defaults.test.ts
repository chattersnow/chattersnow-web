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
import { collectionSurface, type CollectionSurface } from "@/lib/legal-surface";
import { RETENTION_POLICIES } from "@/lib/retention";
import {
  isValidSlotValue,
  contentSlot,
  LEGAL_DOCUMENT_OUTLINES,
} from "@/lib/site-content";

/** A tenant that runs everything: what every site used to be told it was. */
const EVERYTHING: CollectionSurface = collectionSurface({}, {});

/** A tenant with nothing but a portal: no public form of any kind. */
const NOTHING: CollectionSurface = {
  contact: false,
  volunteerApplications: false,
  eventRegistrations: false,
  gearRequests: false,
  artworkSubmissions: false,
  constituentAccounts: false,
  volunteerHours: false,
  googleSignIn: false,
};

const ORG: LegalOrgContext = {
  name: "Riverside Trails",
  emailGeneral: "hello@riverside.example",
  emailPrivacy: "privacy@riverside.example",
  emailConduct: "conduct@riverside.example",
  surfaces: EVERYTHING,
};

const withSurfaces = (surfaces: CollectionSurface): LegalOrgContext => ({
  ...ORG,
  surfaces,
});

/** Everything a reader sees, with the markup markers taken back off. */
function readable(slotKey: string, org: LegalOrgContext = ORG): string {
  const doc = platformLegalDocument(slotKey, org);
  return legalPlainText([
    ...doc.summary,
    ...doc.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
    ]),
  ]);
}

/** Every on/off combination of the surfaces, for the invariants below. */
function everySurface(): CollectionSurface[] {
  const keys = Object.keys(EVERYTHING) as (keyof CollectionSurface)[];
  return Array.from({ length: 1 << keys.length }, (_, mask) =>
    Object.fromEntries(
      keys.map((key, index) => [key, Boolean(mask & (1 << index))]),
    ),
  ) as CollectionSurface[];
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
  // periods and the clocks the purge enforces stay one decision (#602). Since
  // #1291 that is "every period this tenant's forms can produce": the purge
  // still enforces all of them, but a policy has no business publishing a clock
  // for data the site cannot collect.
  test("the privacy policy publishes every retention period it can reach", () => {
    const text = readable("legal.privacy");
    for (const policy of RETENTION_POLICIES) {
      expect(text, `${policy.key} is not published`).toContain(policy.howLong);
      expect(text).toContain(policy.what);
    }
  });

  test("a policy whose surface is off is left out of the table", () => {
    const text = readable("legal.privacy", withSurfaces(NOTHING));
    for (const policy of RETENTION_POLICIES) {
      if (policy.surface === undefined) {
        expect(text, `${policy.key} is not published`).toContain(policy.what);
      } else {
        expect(text, `${policy.key} is published anyway`).not.toContain(
          policy.what,
        );
      }
    }
  });

  test("an unknown slot is an error, not an empty document", () => {
    expect(() => platformLegalDocument("legal.bylaws", ORG)).toThrow();
  });
});

// #1291. The documents describe the forms this tenant actually has, rather than
// every form in the software followed by a sentence admitting some of them may
// not exist.
describe("the collection surface", () => {
  test("the privacy policy names only the forms this site has", () => {
    const text = readable(
      "legal.privacy",
      withSurfaces({ ...NOTHING, contact: true }),
    );
    expect(text).toContain("Contact form");
    expect(text).not.toContain("Volunteer application");
    expect(text).not.toContain("Event registration");
    expect(text).not.toContain("Gear requests");
    expect(text).not.toContain("Artwork submissions");
  });

  // The hedge that stood in for this: the list was every form, and one sentence
  // at the end said some of them might collect nothing.
  test("the hedge sentence is gone", () => {
    expect(readable("legal.privacy")).not.toContain(
      "Not every form above is open on every site",
    );
  });

  test("a site with no public forms still describes what it does collect", () => {
    const text = readable("legal.privacy", withSurfaces(NOTHING));
    expect(text).toContain("Portal accounts");
    expect(text).toContain("IP address");
    expect(text).toContain("encrypted backups");
    expect(text).toContain("Supabase");
  });

  // #1160/#1161 put sign-up on the public site. "Portal accounts -- for the
  // people who run the organization" stopped being true the day a visitor could
  // create one, and nothing described the claim, the self-edits or the hours.
  test("the account bullet says who can hold one", () => {
    expect(readable("legal.privacy", withSurfaces(NOTHING))).toContain(
      "for the people who run the organization",
    );
    const withAccounts = readable(
      "legal.privacy",
      withSurfaces({ ...NOTHING, constituentAccounts: true }),
    );
    expect(withAccounts).not.toContain(
      "for the people who run the organization",
    );
    expect(withAccounts).toContain("Anyone can create an account on this site");
  });

  test("the constituent area's own collection is described only where it exists", () => {
    const off = readable("legal.privacy", withSurfaces(NOTHING));
    const on = readable(
      "legal.privacy",
      withSurfaces({ ...NOTHING, constituentAccounts: true }),
    );
    for (const claim of [
      "Matching your account to our records",
      "What you keep up to date yourself",
      "An account on this site shows you your own record and nothing else",
    ]) {
      expect(on, claim).toContain(claim);
      expect(off, claim).not.toContain(claim);
    }
  });

  // Self-logged hours need the area *and* the Volunteers module, and the
  // module is not the same gate as the public volunteer page.
  //
  // Since #1296 the pairing is enforced by `collectionSurface()` itself rather
  // than at this bullet -- `volunteerHours` cannot be on where the constituent
  // area is off, which `legal-surface.test.ts` pins -- so the surface below
  // turns both off, as the real one would. The `&&` in the bullet stays as the
  // second belt.
  test("self-logged hours are described only where both gates are open", () => {
    const hours = "Hours you log yourself";
    expect(readable("legal.privacy")).toContain(hours);
    expect(
      readable(
        "legal.privacy",
        withSurfaces({
          ...EVERYTHING,
          constituentAccounts: false,
          volunteerHours: false,
        }),
      ),
    ).not.toContain(hours);
    expect(
      readable(
        "legal.privacy",
        withSurfaces({ ...EVERYTHING, volunteerHours: false }),
      ),
    ).not.toContain(hours);
    // The public volunteer page being hidden is not the same thing.
    expect(
      readable(
        "legal.privacy",
        withSurfaces({ ...EVERYTHING, volunteerApplications: false }),
      ),
    ).toContain(hours);
  });

  // Not a bare "Google": the analytics section says what this site does *not*
  // run, and that sentence is true for everyone.
  test("Google is a subprocessor only where Google sign-in is offered", () => {
    const bullet = "with a Google account";
    expect(readable("legal.privacy")).toContain(bullet);
    expect(readable("legal.privacy", withSurfaces(NOTHING))).not.toContain(
      bullet,
    );
    expect(readable("legal.privacy", withSurfaces(NOTHING))).not.toContain(
      "Signing in with Google",
    );
  });

  // Registrations seen by volunteers needs both halves to be true.
  test("volunteers see registrations only where both surfaces are live", () => {
    const staffing =
      "the volunteers staffing it may need to see who registered";
    expect(readable("legal.privacy")).toContain(staffing);
    expect(
      readable(
        "legal.privacy",
        withSurfaces({ ...EVERYTHING, volunteerApplications: false }),
      ),
    ).not.toContain(staffing);
    expect(
      readable(
        "legal.privacy",
        withSurfaces({ ...EVERYTHING, eventRegistrations: false }),
      ),
    ).not.toContain(staffing);
  });

  test("the terms drop the sections about activities this tenant does not run", () => {
    const ids = (surfaces: CollectionSurface) =>
      platformLegalDocument("legal.terms", withSurfaces(surfaces)).sections.map(
        (section) => section.id,
      );
    expect(ids(EVERYTHING)).toContain("events-and-programs");
    expect(ids(EVERYTHING)).toContain("volunteering");
    expect(ids(NOTHING)).not.toContain("events-and-programs");
    expect(ids(NOTHING)).not.toContain("volunteering");
  });

  // What the outline filter buys over an empty section: the section rail is
  // built from the same list, so a dropped section takes its anchor with it.
  test("no document has an empty section at any surface combination", () => {
    for (const surfaces of everySurface()) {
      const org = withSurfaces(surfaces);
      for (const key of PLATFORM_LEGAL_SLOT_KEYS) {
        const doc = platformLegalDocument(key, org);
        expect(doc.sections.length, key).toBeGreaterThan(0);
        for (const section of doc.sections) {
          expect(
            section.paragraphs.length,
            `${key}/${section.id} is empty`,
          ).toBeGreaterThan(0);
          for (const paragraph of section.paragraphs) {
            expect(
              paragraph.trim(),
              `${key}/${section.id} has a blank paragraph`,
            ).not.toBe("");
          }
        }
      }
    }
  });

  test("a section it keeps is never one the outline does not have", () => {
    for (const surfaces of everySurface()) {
      const org = withSurfaces(surfaces);
      for (const key of PLATFORM_LEGAL_SLOT_KEYS) {
        const outlined = new Set(
          LEGAL_DOCUMENT_OUTLINES[key].sections.map((section) => section.id),
        );
        for (const section of platformLegalDocument(key, org).sections) {
          expect(outlined.has(section.id), `${key}/${section.id}`).toBe(true);
          // `requires` is outline metadata and must not reach the published
          // document, which the editor round-trips as a stored value.
          expect(Object.keys(section).sort()).toEqual([
            "id",
            "paragraphs",
            "title",
          ]);
        }
      }
    }
  });

  test("a document with every surface on is still valid for its slot", () => {
    for (const key of PLATFORM_LEGAL_SLOT_KEYS) {
      const slot = contentSlot(key)!;
      for (const surfaces of [EVERYTHING, NOTHING]) {
        expect(
          isValidSlotValue(
            slot,
            platformLegalDocument(key, withSurfaces(surfaces)),
          ),
          key,
        ).toBe(true);
      }
    }
  });
});

// #1295. #859 decided adoption for a public site that was a set of one-shot
// forms. Where a tenant offers accounts, the terms have to govern the standing
// relationship those create -- and where it does not, the platform's terms must
// not carry a heading about accounts nobody can hold.
describe("the terms and the constituent area", () => {
  const ACCOUNTS: CollectionSurface = { ...NOTHING, constituentAccounts: true };

  const terms = (surfaces: CollectionSurface) =>
    platformLegalDocument("legal.terms", withSurfaces(surfaces));

  test("the account section appears only where accounts are offered", () => {
    expect(terms(ACCOUNTS).sections.map((s) => s.id)).toContain("your-account");
    expect(terms(NOTHING).sections.map((s) => s.id)).not.toContain(
      "your-account",
    );
  });

  // The whole reason #1295 is a new section rather than `alwaysInForce`: the
  // platform's terms had nothing about accounts in them, so serving them
  // unconditionally would publish a document that reads as though it governs
  // accounts and does not.
  test("it answers what a terms of use has to answer about an account", () => {
    const text = readable("legal.terms", withSurfaces(ACCOUNTS));
    // Who may hold one and what it is not.
    expect(text).toContain("carries no role here");
    // Responsibility for your own credentials.
    expect(text).toContain("keep your password to yourself");
    // A claim is reviewed, and a false one may be refused.
    expect(text).toContain("somebody here reads it before anything is linked");
    // Suspension and closure, and what happens to the records afterwards.
    expect(text).toContain("suspend or close an account");
    expect(text).toContain("Closing an account doesn't erase our records");
    // No fee, no promise of continuity.
    expect(text).toContain("There is no charge for an account");
  });

  // Self-logged hours need the Volunteers module as well as the area, the same
  // pair of gates the privacy policy's hours bullet answers to.
  test("provisional hours are promised only where they can be logged", () => {
    const pending = "They stay pending until somebody here confirms them";
    expect(
      readable(
        "legal.terms",
        withSurfaces({ ...ACCOUNTS, volunteerHours: true }),
      ),
    ).toContain(pending);
    expect(readable("legal.terms", withSurfaces(ACCOUNTS))).not.toContain(
      pending,
    );
  });

  test("the summary and the description name accounts only where they exist", () => {
    expect(readable("legal.terms", withSurfaces(ACCOUNTS))).toContain(
      "holding an account with us",
    );
    expect(readable("legal.terms", withSurfaces(NOTHING))).not.toContain(
      "holding an account with us",
    );
    expect(
      platformLegalDescription("legal.terms", withSurfaces(ACCOUNTS)),
    ).toContain("hold an account with us");
    expect(
      platformLegalDescription("legal.terms", withSurfaces(NOTHING)),
    ).not.toContain("hold an account with us");
  });
});
