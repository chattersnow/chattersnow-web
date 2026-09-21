/**
 * Whether anybody in this organization has said the platform's legal text is
 * theirs, and whether it has changed since they said it (#1321).
 *
 * A tenant that has published none of its own legal text is served the
 * platform's, generated per request from `@/lib/legal-defaults` and dated by
 * `PLATFORM_LEGAL_LAST_UPDATED`. That is the right default -- #858 exists
 * because the alternative was publishing one nonprofit's legal position under
 * every other nonprofit's brand -- but it leaves two things unrecorded, and
 * both of them matter most for the one document #859 serves unconditionally:
 *
 *   1. **Nobody there ever said it was theirs.** `/privacy` is live from the
 *      moment a tenant is provisioned, because the forms collect personal
 *      information from day one and a policy describing that has to be
 *      reachable while they do. #859's principle -- the platform publishes no
 *      legal position under an organization's name until that organization
 *      says it is theirs -- is deliberately suspended there, and rightly so.
 *      What is wrong is that the suspension was *silent*: no record of whether
 *      the text was ever read, and nothing asking anyone to read it.
 *   2. **The text changes under them.** Bump the constant, edit the prose, and
 *      every default-serving tenant's privacy policy changes on the next
 *      request. Enabling a module does the same through `collectionSurface()`
 *      (#1291), correctly, since the policy must describe what the site
 *      actually collects. Neither told anybody the document had moved.
 *
 * #1292 answers the mirror-image question -- a tenant's *own* published
 * document going stale -- and says in as many words that it cannot answer this
 * one, because the platform's regenerates on every request and so cannot
 * drift. This is that missing half, and it arrives through the same panel, the
 * same attention item and the same permission gate.
 *
 * Free of server-only imports, like `@/lib/legal-documents` and
 * `@/lib/legal-surface` beside it: the Legal documents panel is a client
 * component and the reads live in `@/lib/legal-publication`, which must not
 * reach the client bundle.
 */

/**
 * Where a confirmation is stored: one `app_settings` row per document,
 * `legal_acknowledged.<document key>`.
 *
 * A fourth prefix beside `page_visibility.`, `legal_publication.` and
 * `legal_surface.` -- same storage, same RLS, nothing new to secure -- and
 * like `legal_surface.` deliberately **not** one of the reserved public
 * namespaces in `@/lib/public-namespaces`. No view serves it to `anon`: who in
 * an organization has read its own privacy policy, and when, is nobody's
 * business but that organization's.
 */
export const LEGAL_ACKNOWLEDGEMENT_PREFIX = "legal_acknowledged.";

export function legalAcknowledgementSettingKey(key: string): string {
  return `${LEGAL_ACKNOWLEDGEMENT_PREFIX}${key}`;
}

/** What one stored confirmation records. */
export type LegalAcknowledgementRecord = {
  /** `people.id` of whoever confirmed it, where they had a people row. */
  personId: string | null;
  /**
   * Their name as the portal rendered it at the time, stored beside the id
   * rather than joined on read.
   *
   * Denormalized on purpose, and it is the *historical* answer rather than a
   * stale one: this row says who stood behind the text on the day it was read,
   * which does not change when they later marry, leave, or have their people
   * row merged into somebody else's. The id is stored too, so the current
   * person is still reachable when that is the question being asked. The
   * cheapness is a side benefit -- the portal shell reads this on every page
   * render for a site-content admin, and a join there would be a real cost.
   */
  personName: string | null;
  acknowledgedAt: string | null;
  /** The `PLATFORM_LEGAL_LAST_UPDATED` value the text carried when it was read. */
  platformLastUpdated: string | null;
};

/**
 * One document's confirmation state, as the portal renders it.
 *
 * Reported only where the tenant is being served the platform's text for a
 * document that is in force. A tenant's own document needs no confirmation --
 * publishing it *is* the confirmation -- and text nobody is being served
 * cannot go unread in any way that matters, which is the same rule
 * `getLegalDocumentDrift` answers to from the other side.
 */
export type LegalAcknowledgement =
  /** Nobody here has confirmed they have read it. */
  | { status: "never" }
  /** Confirmed, but the platform has published a newer text since. */
  | {
      status: "stale";
      confirmed: LegalAcknowledgementRecord;
      /** The date the text now carries. */
      updatedTo: string;
    }
  /** Confirmed against the text being served now. */
  | { status: "confirmed"; confirmed: LegalAcknowledgementRecord };

/**
 * Reads one stored `app_settings` value back, or `null` where there is
 * nothing usable in it.
 *
 * Nothing about the shape is trusted: the row is a `jsonb` column that a
 * migration, a seed or somebody at a psql prompt can write, and a half-written
 * value must read as "never confirmed" rather than as a confirmation with
 * blanks in it. Missing the date is the case that matters -- an acknowledgement
 * with no `platform_last_updated` cannot be compared against anything, so it
 * would otherwise report as permanently stale or permanently current depending
 * on which way the comparison happened to fall.
 */
export function parseLegalAcknowledgement(
  value: unknown,
): LegalAcknowledgementRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const platformLastUpdated = row.platform_last_updated;
  if (typeof platformLastUpdated !== "string" || !platformLastUpdated) {
    return null;
  }
  return {
    personId: typeof row.person_id === "string" ? row.person_id : null,
    personName:
      typeof row.person_name === "string" && row.person_name.trim()
        ? row.person_name.trim()
        : null,
    acknowledgedAt:
      typeof row.acknowledged_at === "string" ? row.acknowledged_at : null,
    platformLastUpdated,
  };
}

/**
 * Compared as an exact string rather than as a date.
 *
 * `PLATFORM_LEGAL_LAST_UPDATED` is already a version key in all but name: it
 * is bumped in the same commit as any change to the prose, which is the whole
 * discipline `legal-basis.md` asks of an edit to those documents. Parsing it
 * into a `Date` to ask whether one is later than the other would turn an exact
 * question -- is this the text they read? -- into arithmetic that can only
 * produce a wrong answer. A constant edited to a value that sorts earlier
 * still means the text moved.
 */
export function resolveLegalAcknowledgement(
  record: LegalAcknowledgementRecord | null | undefined,
  current: string,
): LegalAcknowledgement {
  if (!record) return { status: "never" };
  if (record.platformLastUpdated !== current) {
    return { status: "stale", confirmed: record, updatedTo: current };
  }
  return { status: "confirmed", confirmed: record };
}

/** Whether a document's confirmation state is worth asking somebody about. */
export function needsAcknowledgement(
  acknowledgement: LegalAcknowledgement | undefined,
): boolean {
  return (
    acknowledgement?.status === "never" || acknowledgement?.status === "stale"
  );
}
