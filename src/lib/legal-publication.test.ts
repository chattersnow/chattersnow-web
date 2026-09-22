import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  gatesHolding,
  LEGAL_DOCUMENTS,
  legalDocument,
  legalDocumentNoun,
  legalPublicationSettingKey,
  moduleGate,
  resolveInForce,
} from "./legal-documents";
import {
  documentsInForce,
  getLegalAcknowledgementState,
  getLegalPublication,
  getTenantLegalAcknowledgements,
  getTenantLegalPublication,
} from "./legal-publication";
import { PLATFORM_LEGAL_LAST_UPDATED } from "./legal-defaults";
import { legalAcknowledgementSettingKey } from "./legal-acknowledgement";

type Row = { document: string; value: unknown };

function clientReturning(data: Row[] | null): SupabaseClient {
  return {
    from: () => ({ select: async () => ({ data, error: null }) }),
  } as unknown as SupabaseClient;
}

/**
 * `app_settings` as the panel reads it: whole keys, filtered with `.like()`.
 * The public view hands back a bare `document`; this one does not, and the two
 * reads answering for different tenants is exactly what #859 got wrong.
 */
function settingsClientReturning(
  data: { key: string; value: unknown }[] | null,
): SupabaseClient {
  return {
    from: () => ({
      select: () => ({ like: async () => ({ data, error: null }) }),
    }),
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

  // A document is named mid-sentence in eleven places -- "the platform's
  // standard {x}", "Recorded that you have read the {x}" -- and for three of
  // the four the footer's label lowercases into exactly that noun. The
  // accessibility statement is linked as "Accessibility", which does not, so
  // it carries its own noun (#1368). This is what stops the next one being
  // added without one, or with one that adds nothing.
  test("every document has a noun that can sit inside a sentence", () => {
    for (const document of LEGAL_DOCUMENTS) {
      const noun = legalDocumentNoun(document);
      expect(noun, document.key).toBe(noun.toLowerCase());
      expect(noun.length, document.key).toBeGreaterThan(0);
      if (document.noun !== undefined) {
        expect(
          document.noun,
          `${document.key} spells out a noun its label already gives`,
        ).not.toBe(document.label.toLowerCase());
      }
    }
  });

  test("a document with no noun falls back to its label", () => {
    expect(legalDocumentNoun(legalDocument("code_of_conduct")!)).toBe(
      "code of conduct",
    );
    expect(legalDocumentNoun(legalDocument("accessibility")!)).toBe(
      "accessibility statement",
    );
  });

  // The whole shape of #859: one of the four is not a decision.
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
      waiver: false,
      accessibility: false,
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
        waiver: false,
        accessibility: false,
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
        waiver: false,
        accessibility: true,
      }).map((document) => document.route),
    ).toEqual(["/privacy", "/code-of-conduct", "/accessibility"]);
  });
});

describe("getTenantLegalPublication", () => {
  test("reads the admin's own tenant rows out of app_settings", async () => {
    const publication = await getTenantLegalPublication(
      settingsClientReturning([
        { key: "legal_publication.terms", value: true },
        { key: "legal_publication.code_of_conduct", value: true },
      ]),
    );

    expect(publication).toEqual({
      privacy: true,
      terms: true,
      code_of_conduct: true,
      waiver: false,
      accessibility: false,
    });
  });

  test("a document with no row is not in force, and privacy still is", async () => {
    expect(
      await getTenantLegalPublication(settingsClientReturning([])),
    ).toEqual({
      privacy: true,
      terms: false,
      code_of_conduct: false,
      waiver: false,
      accessibility: false,
    });
  });

  test("anything that is not an explicit true is not in force", async () => {
    const publication = await getTenantLegalPublication(
      settingsClientReturning([
        { key: "legal_publication.terms", value: "yes" },
        { key: "legal_publication.code_of_conduct", value: null },
      ]),
    );

    expect(publication.terms).toBe(false);
    expect(publication.code_of_conduct).toBe(false);
  });
});

// #1295. A tenant with `constituent_accounts` on offers its public a standing
// credentialed relationship -- sign-up with a password, a claim somebody
// reviews, hours staff act on -- and #859's adoption switch let that ship with
// no terms in force at all. The module is gated on the document, in both
// directions.
describe("the module gates a document carries", () => {
  test("the constituent area needs the terms of use", () => {
    const found = moduleGate("constituent_accounts");
    expect(found?.document.key).toBe("terms");
    expect(found?.gate.refuseEnabling).toContain("Terms of Use");
    expect(found?.gate.refuseWithdrawing).toContain("Terms of Use");
  });

  test("an ungated module has no gate", () => {
    expect(moduleGate("events")).toBeUndefined();
    expect(moduleGate("")).toBeUndefined();
  });

  // Two documents claiming one module would mean two refusals for one switch,
  // and the caller can only show one of them.
  test("no module is claimed by two documents", () => {
    const claimed = LEGAL_DOCUMENTS.flatMap((document) =>
      document.gates.map((gate) => gate.module),
    );
    expect(claimed.length).toBe(new Set(claimed).size);
  });

  // The document served whatever happens cannot be gating anything: there is
  // no state it can be in that would block a module.
  test("a document that is always in force gates nothing", () => {
    for (const document of LEGAL_DOCUMENTS) {
      if (document.alwaysInForce) expect(document.gates).toEqual([]);
    }
  });

  test("both refusals are written for the person reading them", () => {
    for (const document of LEGAL_DOCUMENTS) {
      for (const gate of document.gates) {
        // The operator is looking at somebody else's organization; the
        // organization's own administrator is looking at their own.
        expect(gate.refuseEnabling).toContain("This organization");
        expect(gate.refuseWithdrawing).toContain("Your");
      }
    }
  });
});

describe("gatesHolding", () => {
  const terms = legalDocument("terms")!;

  test("names the module keeping the document in force", () => {
    expect(
      gatesHolding(terms, { constituent_accounts: true }).map(
        (gate) => gate.module,
      ),
    ).toEqual(["constituent_accounts"]);
  });

  test("an off module holds nothing", () => {
    expect(gatesHolding(terms, { constituent_accounts: false })).toEqual([]);
  });

  // The opposite direction to `moduleEnabled()`, and deliberately: an
  // unreadable entitlement map must not pin a document in force that nothing
  // is actually relying on.
  test("a module map that could not be read holds nothing", () => {
    expect(gatesHolding(terms, {})).toEqual([]);
  });

  test("a document with no gates is never held", () => {
    expect(
      gatesHolding(legalDocument("code_of_conduct")!, {
        constituent_accounts: true,
      }),
    ).toEqual([]);
  });
});

// #1321. A tenant serving the platform's own text has published nothing for
// #1292 to call drift, so this row is the only record that anybody there ever
// read the document -- and the only thing that notices when the platform
// rewrites it underneath them.
describe("what a tenant has confirmed reading", () => {
  const CONFIRMED = {
    person_id: "11111111-1111-1111-1111-111111111111",
    person_name: "Dana Whitfield",
    acknowledged_at: "2026-03-04T12:00:00Z",
    platform_last_updated: PLATFORM_LEGAL_LAST_UPDATED,
  };

  /**
   * Both tables the answer needs, from one stub: the confirmations and the
   * publication switches out of `app_settings`, and whichever `legal.*` slots
   * carry the tenant's own published text out of `site_content`.
   *
   * `getTenantOwnLegalDocuments` chains `.not()` after its `like()` and
   * nothing else does, so the `like` result is a promise that also answers to
   * `.not()` -- which is what a PostgREST builder is.
   */
  function tenantClient(tenant: {
    settings?: { key: string; value: unknown }[];
    ownSlots?: string[];
  }): SupabaseClient {
    const result = (data: unknown[]) => {
      const rows = Promise.resolve({ data, error: null });
      return Object.assign(rows, { not: () => rows });
    };

    return {
      from: (table: string) => ({
        select: () => ({
          like: (_column: string, pattern: string) =>
            table === "site_content"
              ? result(
                  (tenant.ownSlots ?? []).map((key) => ({
                    key,
                    value: "their own text",
                  })),
                )
              : result(
                  (tenant.settings ?? []).filter((row) =>
                    row.key.startsWith(pattern.replace(/%$/, "")),
                  ),
                ),
        }),
      }),
    } as unknown as SupabaseClient;
  }

  describe("getTenantLegalAcknowledgements", () => {
    test("reads the actor, the moment and the version read", async () => {
      const acknowledgements = await getTenantLegalAcknowledgements(
        tenantClient({
          settings: [
            {
              key: legalAcknowledgementSettingKey("privacy"),
              value: CONFIRMED,
            },
          ],
        }),
      );

      expect(acknowledgements.privacy).toEqual({
        personId: "11111111-1111-1111-1111-111111111111",
        personName: "Dana Whitfield",
        acknowledgedAt: "2026-03-04T12:00:00Z",
        platformLastUpdated: PLATFORM_LEGAL_LAST_UPDATED,
      });
      expect(acknowledgements.terms).toBeNull();
    });

    // A key nobody registered is not a document, and a value somebody typed
    // into the table by hand is not a confirmation.
    test("ignores a row for no document, and one with nothing in it", async () => {
      const acknowledgements = await getTenantLegalAcknowledgements(
        tenantClient({
          settings: [
            { key: "legal_acknowledged.cookies", value: CONFIRMED },
            { key: legalAcknowledgementSettingKey("terms"), value: "read it" },
          ],
        }),
      );

      expect(acknowledgements.terms).toBeNull();
      expect("cookies" in acknowledgements).toBeFalse();
    });
  });

  describe("getLegalAcknowledgementState", () => {
    // The state a tenant is in the day it is provisioned: /privacy is live,
    // because the forms are collecting, and nobody there has read it.
    test("a freshly provisioned tenant has confirmed nothing", async () => {
      expect(await getLegalAcknowledgementState(tenantClient({}))).toEqual({
        privacy: { status: "never" },
      });
    });

    test("a confirmation against the text being served is settled", async () => {
      const state = await getLegalAcknowledgementState(
        tenantClient({
          settings: [
            {
              key: legalAcknowledgementSettingKey("privacy"),
              value: CONFIRMED,
            },
          ],
        }),
      );

      expect(state.privacy.status).toBe("confirmed");
    });

    // The failure the ticket is about: the constant moves, the prose moves
    // with it, and the printed date changes on a document nobody re-read.
    test("a confirmation against an earlier text goes stale by itself", async () => {
      const state = await getLegalAcknowledgementState(
        tenantClient({
          settings: [
            {
              key: legalAcknowledgementSettingKey("privacy"),
              value: { ...CONFIRMED, platform_last_updated: "March 1, 2026" },
            },
          ],
        }),
      );

      expect(state.privacy).toMatchObject({
        status: "stale",
        updatedTo: PLATFORM_LEGAL_LAST_UPDATED,
      });
    });

    // The exact complement of `getLegalDocumentDrift`: publishing your own
    // text is the confirmation, and that text is what drift answers for. Every
    // document in force is answered by one of the two, never both, which is
    // what lets the attention item add the counts.
    test("says nothing about a document the tenant wrote itself", async () => {
      expect(
        await getLegalAcknowledgementState(
          tenantClient({ ownSlots: ["legal.privacy"] }),
        ),
      ).toEqual({});
    });

    // Asking somebody to confirm they have read a page that 404s is asking for
    // a signature on a blank sheet.
    test("says nothing about a document nobody is being served", async () => {
      const state = await getLegalAcknowledgementState(tenantClient({}));

      expect("terms" in state).toBeFalse();
      expect("code_of_conduct" in state).toBeFalse();
    });

    test("an adopted document served from the platform's text is asked about", async () => {
      const state = await getLegalAcknowledgementState(
        tenantClient({
          settings: [{ key: "legal_publication.terms", value: true }],
        }),
      );

      expect(state.terms).toEqual({ status: "never" });
    });
  });
});
