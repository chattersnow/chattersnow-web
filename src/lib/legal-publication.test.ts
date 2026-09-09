import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LEGAL_DOCUMENTS,
  legalDocument,
  legalPublicationSettingKey,
  resolveInForce,
} from "./legal-documents";
import { documentsInForce, getLegalPublication } from "./legal-publication";

type Row = { document: string; value: unknown };

function clientReturning(data: Row[] | null): SupabaseClient {
  return {
    from: () => ({ select: async () => ({ data, error: null }) }),
  } as unknown as SupabaseClient;
}

/** The shape PostgREST returns when the view has not been pushed. */
function clientFailing(): SupabaseClient {
  return {
    from: () => ({
      select: async () => ({
        data: null,
        error: {
          code: "PGRST205",
          message:
            "Could not find the table 'public.public_legal_publication' in the schema cache",
          details: null,
          hint: null,
        },
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("legalPublicationSettingKey", () => {
  test("namespaces the document under the legal_publication prefix", () => {
    expect(legalPublicationSettingKey("terms")).toBe("legal_publication.terms");
  });
});

describe("LEGAL_DOCUMENTS", () => {
  test("has no duplicate keys, and every slot key matches its document", () => {
    const keys = LEGAL_DOCUMENTS.map((document) => document.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const document of LEGAL_DOCUMENTS) {
      expect(document.slotKey).toBe(`legal.${document.key}`);
    }
  });

  // The whole shape of #859: one of the three is not a decision.
  test("the privacy policy alone is always in force", () => {
    expect(
      LEGAL_DOCUMENTS.filter((document) => document.alwaysInForce).map(
        (document) => document.key,
      ),
    ).toEqual(["privacy"]);
  });

  // Registering a document only filters it out of the footer. Without a gate in
  // its own layout the URL stays live and indexable, so an organization would
  // drop the link and believe it had taken the text down -- the failure the old
  // global flag was careful to avoid, and worth keeping careful about.
  test("every document that can be out of force has a route gate", () => {
    const publicDir = join(import.meta.dirname, "..", "app", "(public)");

    for (const document of LEGAL_DOCUMENTS) {
      const layout = join(document.route.replace(/^\//, ""), "layout.tsx");
      const source = readFileSync(join(publicDir, layout), "utf8");

      if (document.alwaysInForce) {
        expect(
          source.includes("requireLegalDocumentInForce"),
          `${layout} must not gate the one document that is always served`,
        ).toBe(false);
      } else {
        expect(
          source.includes(`requireLegalDocumentInForce("${document.key}")`),
          `${layout} must call requireLegalDocumentInForce("${document.key}")`,
        ).toBe(true);
      }
    }
  });
});

describe("resolveInForce", () => {
  const terms = legalDocument("terms")!;
  const privacy = legalDocument("privacy")!;

  // Absent is the state every tenant starts in, and the state Chatter Snow is
  // left in by the migration: nothing is published by adding this mechanism.
  test.each([
    [undefined, false],
    [null, false],
    [false, false],
    ["true", false],
    [1, false],
    [true, true],
  ])(
    "a stored %p means %p for a document that can be out of force",
    (value, expected) => {
      expect(resolveInForce(terms, value)).toBe(expected);
    },
  );

  test("the privacy policy is in force whatever the row says", () => {
    for (const value of [undefined, null, false, "no", true]) {
      expect(resolveInForce(privacy, value)).toBe(true);
    }
  });
});

describe("getLegalPublication", () => {
  test("a tenant with no rows serves the privacy policy and nothing else", async () => {
    const publication = await getLegalPublication(clientReturning([]));

    expect(publication).toEqual({
      privacy: true,
      terms: false,
      code_of_conduct: false,
    });
  });

  test("a stored row puts a document in force", async () => {
    const publication = await getLegalPublication(
      clientReturning([{ document: "terms", value: true }]),
    );

    expect(publication.terms).toBe(true);
    expect(publication.code_of_conduct).toBe(false);
  });

  // An unreadable flag must not publish text nobody adopted -- and must not
  // take down the one page that has to stay reachable either.
  test("a failed read serves the privacy policy alone, loudly", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const publication = await getLegalPublication(clientFailing());

      expect(publication).toEqual({
        privacy: true,
        terms: false,
        code_of_conduct: false,
      });
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});

describe("documentsInForce", () => {
  test("keeps registry order and drops what is not served", () => {
    expect(
      documentsInForce({
        privacy: true,
        terms: false,
        code_of_conduct: true,
      }).map((document) => document.route),
    ).toEqual(["/privacy", "/code-of-conduct"]);
  });
});
