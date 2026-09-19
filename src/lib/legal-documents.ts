/**
 * The three public legal documents, and which of them a tenant has put in
 * force (#859).
 *
 * This replaces `LEGAL_PAGES_PUBLISHED`, one boolean compiled into the
 * application. That was the right shape when there was one client: it made one
 * organization's legal review reviewable in the git history, with a date and an
 * author beside it (#768). It is the wrong shape now, because it made **one
 * board's review the gate on every tenant's privacy policy** -- and when that
 * board approved, all three documents went live for every tenant at once,
 * whether or not anybody had read them.
 *
 * The three divide two ways, and only one of them is a decision:
 *
 *   * **The privacy policy is always served.** It has to stay reachable
 *     whenever the site is collecting personal data, which is from the first
 *     day a contact form is live, and there is always something honest to serve
 *     -- the tenant's own document, or the platform's default (#858). A toggle
 *     whose only correct position is "on" is a hazard, not a control, so there
 *     is none.
 *   * **The terms of use and the code of conduct are adopted or not.** An
 *     organization that has adopted neither should not have empty or borrowed
 *     ones served under its name, so they 404 and drop out of the footer until
 *     that tenant says the text is theirs and in force.
 *
 * That second thing is deliberately *not* page visibility. `PUBLIC_PAGE_SLOTS`
 * is about whether a section of the marketing site exists; this is a statement
 * about a document -- "this is ours and it is in force" -- which is why it has
 * its own prefix, its own panel and its own words. #600 argues at length that a
 * show/hide toggle over legal pages would put a compliance failure one click
 * away; adopting a document you have not adopted yet is the opposite move.
 *
 * When #600 and #601 land, approved-version state replaces this: a document
 * becomes in force because a version of it was approved, rather than because a
 * switch says so. This is the smallest thing that unblocks a second tenant in
 * the meantime, and it is one `app_settings` row per document, so there is
 * little to unpick.
 *
 * Free of server-only imports on purpose: the portal panel is a client
 * component and needs the registry. Reads live in `@/lib/legal-publication.ts`.
 */

export type LegalDocument = {
  /** The suffix after `legal.` in site content, and after the settings prefix. */
  key: string;
  /** The `legal.*` site content slot holding the tenant's own text, if any. */
  slotKey: string;
  route: string;
  /** As the footer's legal bar names it. */
  label: string;
  /**
   * Whether the document is served no matter what. True for the privacy policy
   * alone; see the note above.
   */
  alwaysInForce: boolean;
  /** What adopting it means, for the admin deciding. */
  description: string;
  /**
   * The modules this document governs, which makes the dependency run both
   * ways (#1295).
   *
   * #859 decided adoption for a public site that was a set of one-shot forms:
   * you filled one in, we answered, and nothing persisted between us. A tenant
   * with `constituent_accounts` on offers something else -- a credentialed
   * relationship it can suspend, a place where a person asserts things about
   * themselves that staff act on -- and account eligibility, responsibility for
   * your own credentials and what happens when an account closes are exactly
   * what a terms of use governs. On a tenant that has not put one in force,
   * none of it is governed by anything.
   *
   * The fix is to gate the module on the document rather than to make the
   * document unconditional. `alwaysInForce` would reverse #859's actual
   * principle -- the platform publishes no legal position under an
   * organization's name until that organization says it is theirs -- and would
   * force terms on the majority of tenants, since `constituent_accounts` is the
   * one module in the catalog seeded off.
   *
   * Both directions are refused, or the gate is one click from being empty:
   * the module cannot be turned on while the document is not in force, and the
   * document cannot be withdrawn while the module is on. Each gate carries its
   * own two sentences because the two refusals are read by different people --
   * the platform operator looking at somebody else's organization, and that
   * organization's own administrator.
   */
  gates: readonly LegalDocumentGate[];
};

export type LegalDocumentGate = {
  /** A `modules.key`. */
  module: string;
  /** Why the module cannot be turned on. For the platform's module dialog. */
  refuseEnabling: string;
  /** Why the document cannot be withdrawn. For the tenant's legal panel. */
  refuseWithdrawing: string;
};

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  {
    key: "privacy",
    slotKey: "legal.privacy",
    route: "/privacy",
    label: "Privacy Policy",
    alwaysInForce: true,
    description:
      "Always served, and not something to switch off: the site collects personal information through its public forms, and a policy that says what happens to it has to be reachable while it does.",
    gates: [],
  },
  {
    key: "terms",
    slotKey: "legal.terms",
    route: "/terms",
    label: "Terms of Use",
    alwaysInForce: false,
    description:
      "The terms someone agrees to by using the site and signing up for things. Put them in force once your organization has adopted them.",
    gates: [
      {
        module: "constituent_accounts",
        refuseEnabling:
          "This organization has not put its Terms of Use in force. Accounts on a public website are a standing relationship — who may hold one, what a person is responsible for, and what happens when one is closed — and nothing else on their site says what that relationship is. They adopt the terms themselves, from Website › Legal documents.",
        refuseWithdrawing:
          "Your Terms of Use are what governs the accounts people hold on your public website, so they cannot be taken out of force while those accounts are offered. Ask us to turn the signed-in area off first, and the terms are yours to withdraw again.",
      },
    ],
  },
  {
    key: "code_of_conduct",
    slotKey: "legal.code_of_conduct",
    route: "/code-of-conduct",
    label: "Code of Conduct",
    alwaysInForce: false,
    description:
      "What your organization expects of people at its events and in its spaces, and how someone reports a problem. Put it in force once your organization has adopted it.",
    gates: [],
  },
] as const;

export const LEGAL_PUBLICATION_PREFIX = "legal_publication.";

export function legalPublicationSettingKey(key: string): string {
  return `${LEGAL_PUBLICATION_PREFIX}${key}`;
}

export function legalDocument(key: string): LegalDocument | undefined {
  return LEGAL_DOCUMENTS.find((document) => document.key === key);
}

/**
 * Resolves a stored `app_settings` value to whether the document is in force.
 *
 * Anything that is not an explicit `true` -- a missing row, a null, a value
 * somebody typed into the table by hand -- means not in force. The default has
 * to be the cautious one in both directions: publishing terms nobody adopted is
 * the failure this exists to prevent, and an unreadable row must not do it.
 */
export function resolveInForce(
  document: LegalDocument,
  value: unknown,
): boolean {
  if (document.alwaysInForce) return true;
  return value === true;
}

/**
 * The gate standing between a module and the document it needs, if there is
 * one (#1295).
 *
 * A module appears in at most one document's `gates`: two documents claiming
 * the same module would mean two refusals for one switch, and the caller could
 * only show one of them. `legal-documents.test.ts` holds that.
 */
export function moduleGate(
  moduleKey: string,
): { document: LegalDocument; gate: LegalDocumentGate } | undefined {
  for (const document of LEGAL_DOCUMENTS) {
    const gate = document.gates.find((entry) => entry.module === moduleKey);
    if (gate) return { document, gate };
  }
  return undefined;
}

/**
 * The gates holding a document in force: the modules it governs that are
 * currently on.
 *
 * `modules` is a key -> enabled map in either of the shapes the portal reads,
 * and a module missing from it counts as **off** rather than on. That is the
 * opposite of `moduleEnabled()`, deliberately: everywhere else an unreadable
 * entitlement map must not take a section of the product dark, whereas here it
 * must not pin a document in force that nothing is relying on.
 */
export function gatesHolding(
  document: LegalDocument,
  modules: Record<string, boolean>,
): LegalDocumentGate[] {
  return document.gates.filter((gate) => modules[gate.module] === true);
}
