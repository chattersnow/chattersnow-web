/**
 * Whether this organization requires a second approver before a legal document
 * reaches its public site, and what that approval records (#600).
 *
 * One person holding `site_content:manage` can rewrite the privacy policy and
 * publish it in one gesture. For a tenant with a board and a handful of
 * administrators, a second pair of eyes on that is a reasonable control, and
 * #793's stamps already make it checkable: the drafter and the publisher are
 * both written by a database trigger from `auth.uid()`, so neither can be
 * forged by the person doing it.
 *
 * It is **opt-in, per tenant, and off by default**, which is the whole design
 * decision. The portal ships `access_management_single_administrator` as an
 * attention item precisely because single-administrator tenants are an
 * expected, supported state, and the platform sells to small businesses as
 * well as small nonprofits. A platform-wide four-eyes rule would leave such a
 * tenant unable to publish its own privacy policy at all -- pinned to the
 * platform's default indefinitely, with no way out short of buying another
 * seat -- which is a worse outcome than the risk being controlled. Nothing
 * legal requires four eyes on a privacy policy either.
 *
 * The same reasoning is why a tenant with fewer than `MINIMUM_APPROVERS`
 * people who can publish website content is refused when it tries to switch
 * the gate on: that is the identical lockout, arrived at by a different route.
 *
 * Free of server-only imports, like `@/lib/legal-documents`,
 * `@/lib/legal-surface` and `@/lib/legal-acknowledgement` beside it: the Legal
 * documents panel and the publish dialog are client components, and the reads
 * live in `@/lib/legal-publication`, which must not reach the client bundle.
 */

/**
 * Where the setting is stored: one `app_settings` row per tenant, in the same
 * shape as `legal_publication.*` and `page_visibility.*`.
 *
 * A fifth prefix beside those, `legal_surface.` and `legal_acknowledged.` --
 * same table, same RLS, nothing new to secure -- and, like the last two,
 * deliberately **not** one of the reserved public namespaces in
 * `@/lib/public-namespaces`. No view serves it to `anon`: how an organization
 * governs its own publishing is nobody's business but that organization's.
 */
export const LEGAL_APPROVAL_SETTING_KEY = "legal_approval.required";

/**
 * How many people who can publish website content a tenant needs before it may
 * require a second approver. Two is not a policy choice so much as arithmetic:
 * with one, every publish is self-approved and therefore refused.
 */
export const MINIMUM_APPROVERS = 2;

/**
 * Caps on what an approver types, applied in the Server Action.
 *
 * The reference is a phrase naming what approved the text -- a meeting, a
 * review, a thread -- and the notes are what the approver said about it. The
 * database requires both to be non-blank; the lengths are here so that one
 * pasted document cannot become an `audit_log` row nobody can read.
 */
export const APPROVAL_REFERENCE_MAX_LENGTH = 200;
export const REVIEW_NOTES_MAX_LENGTH = 2000;

/** What the person publishing a legal document has to say about the approval. */
export type LegalPublishApproval = {
  /**
   * What approved this text, in free text. Deliberately not a foreign key to
   * anything: `governance` is a non-core module a tenant may not be entitled
   * to, and a tenant may have no board at all.
   */
  reference: string;
  /** What the approver said when they approved it. */
  notes: string;
};

/**
 * Resolves a stored `app_settings` value to whether the gate is on.
 *
 * Anything that is not an explicit `true` -- a missing row, a null, something
 * typed into the table by hand -- means off. Off is the cautious default in
 * both directions here: a gate that turned itself on because a row was
 * unreadable would stop an organization publishing its own legal text, which
 * is the failure this feature is shaped to avoid.
 */
export function resolveApprovalRequired(value: unknown): boolean {
  return value === true;
}

/** Whether a key names one of the legal documents' content slots. */
export function isLegalSlotKey(key: string): boolean {
  return key.startsWith("legal.");
}

/**
 * The approval as it will be sent, or `null` when either half is blank.
 *
 * Both the dialog (to decide whether Publish is offered) and the Server Action
 * (to decide whether to send anything at all) ask this, so "an approval with
 * an empty reference is not an approval" is written once. Trimming here also
 * means the database sees what the person actually typed rather than their
 * whitespace.
 */
export function completeApproval(
  approval: LegalPublishApproval | null | undefined,
): LegalPublishApproval | null {
  const reference = approval?.reference.trim() ?? "";
  const notes = approval?.notes.trim() ?? "";
  if (!reference || !notes) return null;
  return { reference, notes };
}

/** A draft of a legal document waiting for somebody to publish it. */
export type LegalDraftPending = {
  draftedAt: string | null;
  /** Who saved it, as the portal renders names, or null where unknown. */
  draftedBy: string | null;
  /**
   * Whether the person reading this is the one who saved it, which is the
   * whole of "who is waiting on whom": their own draft is the one they cannot
   * publish, and somebody else's is the one waiting for them.
   */
  draftedByViewer: boolean;
};

/** The approval recorded on a legal document's published text, if any. */
export type LegalApprovalRecord = {
  approvedAt: string | null;
  /** Who approved it, as the portal renders names, or null where unknown. */
  approvedBy: string | null;
  reference: string;
  notes: string;
};

/**
 * What the Legal documents panel says about a document's publishing state.
 *
 * Both halves are absent in the ordinary case -- nothing pending, and either
 * no approval on file or the gate never on -- so a document with nothing to
 * report says nothing rather than saying it is fine.
 */
export type LegalPublishState = {
  pending: LegalDraftPending | null;
  approval: LegalApprovalRecord | null;
};
