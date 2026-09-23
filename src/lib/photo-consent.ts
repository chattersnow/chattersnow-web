/**
 * Photos at events: a notice at registration, and a standing right to object
 * (#1376).
 *
 * #599 shipped this as a question — the organization's own scope above an
 * unticked box, with three columns recording the answer. The platform owner
 * has reversed that. **Registering for an event is itself the agreement to
 * being photographed, and the remedy is removal**: any photo can be taken down
 * on request, at any time. There is no box. Offered a decline box as an
 * opt-out instead, the answer was still "no box".
 *
 * **So the word "consent" leaves every surface a human reads, and the column
 * names stay.** Agreement implied by submitting a form is not an unambiguous
 * affirmative act, so a privacy policy that kept calling it consent would make
 * a false statement about the lawful basis. The honest framing, and the
 * intended one, is notice plus a standing right to object. Renaming the
 * columns to `photo_objection` would mean retyping two RPCs, the grant list,
 * the published API field, the generated types and every test, for a name — so
 * `20260923020000` flips their meaning in `comment on` statements and touches
 * no row.
 *
 * **Three states, and only one of them has an operational job.**
 *
 * - `null` — **no objection on record.** Agreement is implied by registering.
 *   Every row that predates #599, every walk-in, every staff-added registrant,
 *   every caller of the public API, and — since this ticket — every
 *   registration taken through this platform's own forms.
 * - `false` — **objected. Do not photograph.** This is the list somebody
 *   checks before pointing a camera, and it means exactly what it meant under
 *   #599, which is why no row needed backfilling.
 * - `true` — the objection was withdrawn, or somebody confirmed explicitly
 *   through the public API.
 *
 * Nothing may read `null` as an objection, and nothing may write `true` at
 * registration: a form with no affirmative control cannot produce an
 * affirmative record.
 *
 * **The implication is the tenant's to assert, not the platform's.** What an
 * organization does with a photo of somebody's face is off-platform and
 * unknowable from this codebase, and "registering means you agree" is a claim
 * about that organization's own arrangements — `docs/legal-basis.md` rule 2.
 * So `events.photo_consent` stays a blank tenant slot, **a tenant that has
 * written nothing says nothing at all**, and the platform's own sentence below
 * describes only the mechanism and the remedy, both of which are facts about
 * this software. Almost every tenant is in the blank state and it is the one
 * that must never break.
 *
 * **The snapshot survives, and still matters.** `photo_consent_text` copies the
 * tenant's paragraphs onto the row when an objection is recorded, read inside
 * the RPC and never from the client — #1319's shape, because a content slot has
 * no version table and no permalink, so the words are citable only from the row
 * holding them. It is now a copy of what somebody was *told* at the moment they
 * objected rather than what they were asked, which is why nothing writes it at
 * registration time any more.
 */

/** The heading over the organization's own paragraphs. */
export const PHOTO_CONSENT_HEADING = "Photos and video";

/**
 * What the RPC raises when somebody tries to record an objection against an
 * organization that publishes no photo notice, and what the Server Action
 * turns it back into.
 *
 * There is deliberately **no** equivalent on the way in: nothing is collected
 * at registration any more, so there is nothing a blank slot could refuse.
 */
export const PHOTO_CONSENT_UNAVAILABLE_CODE = "PHOTO_CONSENT_UNAVAILABLE";

export const PHOTO_CONSENT_UNAVAILABLE_ERROR =
  "This organization does not publish a photo notice, so there is nothing to record against here. Email them if you'd rather not be photographed, or to have a photo taken down.";

/**
 * The three sentences describing what is on the record, said plainly.
 *
 * Somebody checking whether their objection actually stuck is the main reason
 * to open the registration page, so the stored state is stated before the
 * control that changes it — and the `null` sentence says what is *not* on the
 * record rather than reporting an absence, because "nothing here yet" reads as
 * a gap somebody should fill.
 */
export const PHOTO_OBJECTION_NONE =
  "You haven't asked us not to photograph you.";

export const PHOTO_OBJECTION_RECORDED =
  "You've asked us not to photograph or record you, and the people running the event can see that.";

export const PHOTO_OBJECTION_WITHDRAWN = "You've told us photos are fine.";

/**
 * The control, in the first person and in the direction that has an
 * operational job.
 *
 * The primary action records an objection; withdrawing one is offered only
 * once there is something to withdraw. A pair of buttons rather than a
 * checkbox and a Save: a box that starts unticked next to "photos are fine"
 * would be a consent control again, and this is not consent.
 */
export const PHOTO_OBJECTION_ACTION = "Please don't photograph or record me";

export const PHOTO_OBJECTION_WITHDRAW_ACTION =
  "I've changed my mind — photos are fine";
