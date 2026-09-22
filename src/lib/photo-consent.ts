/**
 * "Are you happy for us to photograph you?" — asked at registration (#599).
 *
 * `/terms` and `/code-of-conduct` have said since they were written that where
 * an organization photographs participants for its own communications it
 * relies on "the consent process described at registration or at the event
 * itself". There was no consent process at registration. The promise survived
 * on its second half alone — an organizer remembering to ask, with no record
 * of the answer. This makes the first half true for any tenant that wants it.
 *
 * **The mechanism is the platform's; the scope is the organization's, and the
 * platform writes none of it.** What an organization does with a photo — its
 * own site and social accounts, press, sponsors, grant reports — is
 * off-platform and unknowable from this codebase, and a scope invented here
 * would be a commitment made on a tenant's behalf (`docs/legal-basis.md`
 * rule 2). So it is the `events.photo_consent` content slot, blank until
 * somebody writes it, and **a tenant that has written nothing asks nothing**:
 * the registration form is byte-identical to what it was before this shipped
 * and every column stays null. Almost every tenant is in that state, and it is
 * the one that must never break.
 *
 * **Three states, and the third is the valuable one.** A waiver has two,
 * because declining is not submitting: you accept, or you do not register, and
 * no row exists to hold a refusal. Photo consent has three.
 *
 * - `null` — not asked. This tenant had written no scope when this person
 *   registered, or the answer came from a caller of the public API that did not
 *   ask. Every row that predates this ticket, every walk-in and every
 *   staff-added registrant is here.
 * - `false` — asked and **declined**. This is a record with an operational job:
 *   it is the list somebody checks before pointing a camera.
 * - `true` — asked and granted.
 *
 * Nothing may read `null` as either answer, and nothing may read a missing row
 * as consent.
 *
 * **Not a fifth legal document.** #686 made the participant waiver one because
 * a release of legal rights *is* one: sections, a version history, an address
 * somebody can be sent to. This is one question with a yes/no answer and a
 * scope. A `/photo-consent` route in the footer's Legal bar would publish a
 * policy at the one place nobody reads it.
 *
 * **A snapshot, not a version pointer.** #1319's test: the version-table shape
 * earns its cost only when the text has to be citable from outside the row that
 * accepted it. `/waiver?version=N` is a permalink; a content slot has no
 * version table, no address and no permalink, so the words somebody answered
 * are citable only from the row holding them. `photo_consent_text` copies them,
 * read from the tenant's own row inside the RPC and never from the client —
 * exactly as `artwork_submissions.consented_terms` is.
 */

/** The heading over the organization's own scope. */
export const PHOTO_CONSENT_HEADING = "Photos and video";

/**
 * The question, and it is deliberately narrow: it names **this registrant**
 * and not the party.
 *
 * `party_size` can be more than one, and one adult cannot consent for another
 * adult. The copy says "you", and nothing may read the record as covering
 * anybody else in the party.
 *
 * The minors branch is the one exception, and it branches **the label, not the
 * record**. `/terms` and `/code-of-conduct` already claim that consent for
 * anyone under 18 comes from a parent or guardian, so where
 * `party_includes_minor` is true (#685) the label says the adult registering is
 * answering for the minors in their party in that capacity. One column, one
 * answer. A second question with a second column would be two things to keep in
 * step and two things for an organizer to reconcile at the moment they are
 * holding a camera.
 */
export function photoConsentLabel(partyIncludesMinor: boolean): string {
  if (partyIncludesMinor) {
    return "I'm happy to be photographed or recorded, and — as their parent or guardian — for the under-18s in my party to be";
  }
  return "I'm happy to be photographed or recorded";
}

/**
 * What the platform can say about the record on every tenant, written scope or
 * not.
 *
 * A fact about this software rather than about any organization: the answer is
 * stored, a no is stored as a no, and it can be changed afterwards. The last
 * clause is not decoration — `/terms` promises a takedown route by email, and
 * this is the one that does not depend on somebody reading a mailbox. **A
 * consent that cannot be withdrawn is not consent**, which is the substantive
 * difference from a waiver, accepted once and standing.
 */
export const PHOTO_CONSENT_FORM_NOTE =
  "Either answer is fine, and we keep whichever you give — including a no, so the people running the event know. You can change your mind later from your registration page, or by emailing us.";

/** The form field name, so the component and the parser cannot drift. */
export const PHOTO_CONSENT_FIELD = "photoConsent";

/**
 * What the RPC raises when somebody tries to change an answer to a question
 * the organization has stopped asking, and what the Server Action turns it
 * back into.
 *
 * There is deliberately **no** equivalent on the way in. Declining is a valid
 * submission and must never block one, so `resolved_photo_consent()` raises
 * nothing: where the slot was emptied between render and submit it records
 * `null` rather than a stale snapshot.
 */
export const PHOTO_CONSENT_UNAVAILABLE_CODE = "PHOTO_CONSENT_UNAVAILABLE";

export const PHOTO_CONSENT_UNAVAILABLE_ERROR =
  "This organization is no longer asking about photos, so there is nothing to change here. Email them if you need a photo taken down.";

/**
 * A raw form value as the column stores it.
 *
 * An absent field is `null`, not `false`. The component renders nothing at all
 * on a tenant with no scope written, so an absent field means the question was
 * never put — and reading that as a decline would invent a refusal, just as
 * reading it as consent would invent permission. An unticked box that *was*
 * rendered submits `"off"`, which is a real `false`.
 */
export function parsePhotoConsent(
  raw: FormDataEntryValue | null,
): boolean | null {
  const value = String(raw ?? "").trim();
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

/** What the component submits for a rendered box in either state. */
export function photoConsentValue(checked: boolean): "on" | "off" {
  return checked ? "on" : "off";
}

/**
 * How the portal names the answer.
 *
 * Null returns null rather than a sentence: "not asked" is the caller's to
 * word, because the registrants table and the detail sheet say it differently
 * — one shows nothing at all, the other explains why there is nothing.
 */
export function photoConsentLabelForStaff(
  consent: boolean | null,
): string | null {
  if (consent === null) return null;
  return consent ? "Photos OK" : "No photos";
}
