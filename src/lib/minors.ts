/**
 * "Is anyone in your party under 18?" — asked at registration (#685).
 *
 * `/code-of-conduct` and `/terms` have said for months that a minor takes part
 * only with a parent or guardian, and nothing in the product knew whether one
 * was coming. A party size of four could be one adult and three children, and
 * the first anyone found out was at the mountain, where the only choices left
 * are turning a family away or ignoring the rule the organization published.
 *
 * **What is here is the mechanism, not the rule.** The platform asks the
 * question, collects an adult it can reach and an emergency contact, and says
 * what it does with them. What an organization *requires* — who must
 * accompany, whether that adult registers and counts in the party size,
 * whether there is an age floor at all — is that organization's claim, and
 * `docs/legal-basis.md` rule 2 keeps it out of a default. It is the
 * `events.minor_accompaniment` content slot, blank until somebody writes it,
 * exactly like `get_involved.volunteer_screening` (#690). A tenant that has
 * decided nothing shows nothing here.
 *
 * Nothing is accepted. #1318 decided that submitting a public form accepts
 * nothing, so the paragraphs are notice rather than consent: no checkbox, no
 * stored pointer to a version. The one box on this form that carries a real
 * choice is the participant agreement's (#686), and diluting it is the reason
 * this one does not exist.
 *
 * **Three states, and only one of them is a "no".** The column is nullable and
 * null means *nobody was asked* — every row that predates this ticket, every
 * walk-in and staff-added registrant, and every caller of the public API,
 * whose contract (`docs/public-api.md`) cannot be made to answer a new
 * question retroactively. Both forms require an answer; the RPC requires only
 * that an answer of "yes" arrives with the contacts, because that is the rule
 * a degrading platform can actually hold.
 */

/** The question, worded once so the two registration forms cannot drift. */
export const PARTY_INCLUDES_MINOR_QUESTION =
  "Is anyone in your party under 18?";

/**
 * Why we ask, in the registrant's terms. It says what the answer is *for* and
 * stops there: "a parent or guardian must stay for the whole event" is one
 * organization's rule, and belongs in that organization's own paragraphs
 * below, not in a sentence every tenant serves.
 */
export const PARTY_INCLUDES_MINOR_DESCRIPTION =
  "It helps us plan the day, and it tells us who to reach if we need to.";

export const PARTY_INCLUDES_MINOR_OPTIONS = [
  { value: "no", label: "No — everyone is 18 or over" },
  { value: "yes", label: "Yes" },
] as const;

/**
 * What the form asks for once the answer is yes, and what it never asks for.
 *
 * A fact about *this software*, checkable against `parseMinorContacts()` and
 * against the columns the migration adds, so it renders on every tenant
 * whether or not one has written a word — the same split
 * `volunteer-screening-notice.tsx` makes (#690). It is protective rather than
 * decorative: an organization that has adopted no policy is still collecting
 * a child's guardian's mobile number the moment somebody answers yes, and the
 * place to say what happens to it is where they are typing it.
 *
 * "never asks a date of birth" is the half worth keeping honest. Nothing in
 * `src` or `supabase` stores one, an age, or a government identification
 * number for a registrant, and `minors.test.ts` fails the day that changes.
 */
export const MINOR_FORM_ASKS_FOR =
  "If anyone in your party is under 18 we'll ask for an adult we can reach on the day, and someone to call in an emergency. We never ask for anyone's date of birth, age, or ID number — please don't put those in this form.";

/**
 * The emergency contact is the only person this product collects details of
 * who never came to the site, so they are the only one who cannot be told at
 * the point of collection. The registrant is asked to tell them instead.
 */
export const MINOR_THIRD_PARTY_NOTE =
  "Please make sure the person you name as an emergency contact is happy for us to hold their name and number.";

export const MINOR_CONTACT_LABELS = {
  accompanyingAdultName: "Accompanying adult's name",
  accompanyingAdultPhone: "Accompanying adult's mobile number",
  emergencyContactName: "Emergency contact's name",
  emergencyContactPhone: "Emergency contact's phone number",
} as const;

export type MinorContactKey = keyof typeof MINOR_CONTACT_LABELS;

export const MINOR_CONTACT_KEYS = Object.keys(
  MINOR_CONTACT_LABELS,
) as MinorContactKey[];

/**
 * What the RPC raises when a "yes" arrives without the four, and what the two
 * Server Actions turn it back into. One string, so the message a reader sees
 * cannot drift from the condition that produced it.
 */
export const MINOR_CONTACTS_REQUIRED_CODE = "MINOR_CONTACTS_REQUIRED";

export const MINOR_CONTACTS_REQUIRED_ERROR =
  "Please give us an accompanying adult and an emergency contact for anyone under 18.";

/**
 * What the two forms say when the question itself is left alone.
 *
 * Client-side only, and there is deliberately no RPC exception to match it:
 * the server must keep accepting an unanswered question from the public API,
 * whose published contract predates this field. The control is `required` as
 * well, and this message is what a reader gets when a browser lets a
 * non-native control through anyway.
 */
export const PARTY_INCLUDES_MINOR_REQUIRED_ERROR =
  "Please tell us whether anyone in your party is under 18.";

/** The four, as the columns store them: trimmed, or null when left blank. */
export type MinorContacts = {
  accompanying_adult_name: string | null;
  accompanying_adult_phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

export const NO_MINOR_CONTACTS: MinorContacts = {
  accompanying_adult_name: null,
  accompanying_adult_phone: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
};

/**
 * A raw form value as the column stores it. Anything that is not exactly
 * "yes" or "no" — blank, absent, or hand-crafted — is *unanswered*, which is
 * the only safe reading of an answer we did not get, and never "no": a row
 * read as "no minors" on the strength of a question nobody answered is the
 * failure this ticket exists to prevent.
 */
export function parsePartyIncludesMinor(
  raw: FormDataEntryValue | null,
): boolean | null {
  const value = String(raw ?? "").trim();
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

/** The select's value for a stored answer: `""` when it is unanswered. */
export function partyIncludesMinorValue(answer: boolean | null): string {
  if (answer === null) return "";
  return answer ? "yes" : "no";
}

/**
 * The four contacts off a form, and whether they are complete.
 *
 * Contacts are read **only** when the answer is yes. A party that answered no
 * and has stale values in hidden inputs — a reader who ticked yes, filled
 * them in and changed their mind — must not have them stored: the column
 * constraint refuses it, and more to the point nobody agreed to give them.
 */
export function parseMinorContacts(
  includesMinor: boolean | null,
  formData: FormData,
): { data: MinorContacts } | { error: string } {
  if (includesMinor !== true) return { data: { ...NO_MINOR_CONTACTS } };

  const read = (key: string) => String(formData.get(key) ?? "").trim();
  const data: MinorContacts = {
    accompanying_adult_name: read("accompanyingAdultName") || null,
    accompanying_adult_phone: read("accompanyingAdultPhone") || null,
    emergency_contact_name: read("emergencyContactName") || null,
    emergency_contact_phone: read("emergencyContactPhone") || null,
  };

  if (Object.values(data).some((value) => value === null)) {
    return { error: MINOR_CONTACTS_REQUIRED_ERROR };
  }
  return { data };
}

/** How the portal names the answer. Null is not "no" and never renders as one. */
export function partyIncludesMinorLabel(answer: boolean | null): string | null {
  if (answer === null) return null;
  return answer ? "Includes a minor" : "All 18 or over";
}
