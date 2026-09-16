// What a person may say about themselves (#1164), and the parsing of the form
// that says it.
//
// The authoritative allowlist is `set_my_contact_details()`'s argument list --
// a server action that only sends the allowed fields is not the control, and
// the migration says so at length. This module exists so that the form, the
// action and the tests agree on the same field names and the same messages,
// and so that a person is told what is wrong with a handle before a round trip
// reports it as a failure.
import {
  isExperienceLevel,
  isRidingDiscipline,
  ridesSki,
  ridesSnowboard,
  type ExperienceLevel,
  type RidingDiscipline,
} from "@/lib/rider-profile";
import { parsePronouns } from "@/lib/pronouns";

const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

/**
 * The shape `my_contact_details()` returns, and what the form renders.
 *
 * `name` and `email` are here to be *shown*, not edited: a person opening this
 * page needs to see the name the organization has them under, even though
 * correcting it is a conversation with a staffer rather than a text field.
 */
export type MyContactDetails = {
  person_id: string;
  name: string | null;
  preferred_name: string | null;
  email: string | null;
  email_pending: string | null;
  email_pending_expires_at: string | null;
  phone: string | null;
  pronouns: string | null;
  instagram_handle: string | null;
  preferred_mountain: string | null;
  riding_discipline: RidingDiscipline | null;
  ski_experience_level: ExperienceLevel | null;
  snowboard_experience_level: ExperienceLevel | null;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_region: string | null;
  address_postal_code: string | null;
  address_country: string | null;
};

/** The arguments of `set_my_contact_details()`, keyed as the RPC takes them. */
export type ContactDetailsArgs = {
  p_preferred_name: string | null;
  p_phone: string | null;
  p_pronouns: string | null;
  p_instagram_handle: string | null;
  p_preferred_mountain: string | null;
  p_riding_discipline: string | null;
  p_ski_experience_level: string | null;
  p_snowboard_experience_level: string | null;
  p_address_line1: string | null;
  p_address_line2: string | null;
  p_address_city: string | null;
  p_address_region: string | null;
  p_address_postal_code: string | null;
  p_address_country: string | null;
};

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

/**
 * Turns the form into the RPC's arguments, or into the one sentence that says
 * what to fix.
 *
 * Every field is optional. This is a record somebody else created about a
 * person, and a form that refuses to save until they have filled in a postal
 * address is a form that loses the corrected phone number they came to give.
 *
 * A level for a discipline the person does not ride is dropped rather than
 * refused, which is what the staff form does and what the database's own
 * people_ski_level_requires_ski check would otherwise turn into an error about
 * a field the person never touched.
 */
export function parseMyContactForm(
  formData: FormData,
): { error: string } | { args: ContactDetailsArgs } {
  const pronouns = parsePronouns(formData.get("pronouns"));
  if ("error" in pronouns) return pronouns;

  const instagramHandle = field(formData, "instagramHandle").replace(/^@/, "");
  if (instagramHandle && !INSTAGRAM_HANDLE_PATTERN.test(instagramHandle)) {
    return {
      error:
        "An Instagram handle can only contain letters, numbers, periods and underscores.",
    };
  }

  const ridingDisciplineRaw = field(formData, "ridingDiscipline");
  if (ridingDisciplineRaw && !isRidingDiscipline(ridingDisciplineRaw)) {
    return { error: "Select a valid riding discipline." };
  }
  const ridingDiscipline = isRidingDiscipline(ridingDisciplineRaw)
    ? ridingDisciplineRaw
    : null;

  const skiLevel = field(formData, "skiExperienceLevel");
  const snowboardLevel = field(formData, "snowboardExperienceLevel");

  return {
    args: {
      p_preferred_name: field(formData, "preferredName") || null,
      p_phone: field(formData, "phone") || null,
      p_pronouns: pronouns.pronouns,
      p_instagram_handle: instagramHandle || null,
      p_preferred_mountain: field(formData, "preferredMountain") || null,
      p_riding_discipline: ridingDiscipline,
      p_ski_experience_level:
        ridesSki(ridingDiscipline) && isExperienceLevel(skiLevel)
          ? skiLevel
          : null,
      p_snowboard_experience_level:
        ridesSnowboard(ridingDiscipline) && isExperienceLevel(snowboardLevel)
          ? snowboardLevel
          : null,
      p_address_line1: field(formData, "addressLine1") || null,
      p_address_line2: field(formData, "addressLine2") || null,
      p_address_city: field(formData, "addressCity") || null,
      p_address_region: field(formData, "addressRegion") || null,
      p_address_postal_code: field(formData, "addressPostalCode") || null,
      p_address_country: field(formData, "addressCountry") || null,
    },
  };
}
