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
  },
  {
    key: "terms",
    slotKey: "legal.terms",
    route: "/terms",
    label: "Terms of Use",
    alwaysInForce: false,
    description:
      "The terms someone agrees to by using the site and signing up for things. Put them in force once your organization has adopted them.",
  },
  {
    key: "code_of_conduct",
    slotKey: "legal.code_of_conduct",
    route: "/code-of-conduct",
    label: "Code of Conduct",
    alwaysInForce: false,
    description:
      "What your organization expects of people at its events and in its spaces, and how someone reports a problem. Put it in force once your organization has adopted it.",
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
