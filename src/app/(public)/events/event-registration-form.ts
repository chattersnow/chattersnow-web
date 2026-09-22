import type { ParseResult } from "@/lib/forms";
import { parseAttendedBefore } from "@/lib/attended-before";
import { parsePronouns } from "@/lib/pronouns";

const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

export type EventRegistrationFormData = {
  name: string;
  email: string;
  phone: string | null;
  instagram_handle: string | null;
  pronouns: string | null;
  party_size: number;
  notes: string | null;
  /**
   * Self-reported, and null when the question went unanswered (#1259). Never
   * validated into a boolean: there is no wrong answer to give, and a value
   * the form did not offer means the question was not answered.
   */
  attended_before: boolean | null;
  /**
   * Whether the participant waiver's box was ticked (#686).
   *
   * Not validated here, and that is deliberate: this parser cannot know
   * whether the tenant has a waiver in force, and a guess would be a second
   * gate able to disagree with the one that actually binds. The RPC decides,
   * because it is the thing that reads the publication state and writes the
   * row.
   */
  waiver_accepted: boolean;
  /**
   * The version the form rendered, for the RPC to compare against the one in
   * force. Null when no waiver was shown. Never stored from this value -- the
   * RPC writes the version it read itself.
   */
  waiver_version: number | null;
};

export function parseEventRegistrationForm(
  formData: FormData,
): ParseResult<EventRegistrationFormData> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const instagramHandle = String(formData.get("instagramHandle") ?? "")
    .trim()
    .replace(/^@/, "");
  const pronouns = parsePronouns(formData.get("pronouns"));
  const notes = String(formData.get("notes") ?? "").trim();
  const partySizeRaw = String(formData.get("partySize") ?? "").trim();
  const attended_before = parseAttendedBefore(formData.get("attendedBefore"));
  const waiver_accepted = formData.get("waiverAccepted") === "on";
  // Digits only, and no leading zero, the same discipline `selectLegalVersion`
  // applies to `?version=`. Anything else is treated as "not sent" rather than
  // rejected: a malformed value cannot match the version in force, and the RPC
  // refuses on the mismatch with a message about the document rather than
  // about a number the reader never saw.
  const waiverVersionRaw = String(formData.get("waiverVersion") ?? "").trim();
  const waiver_version = /^[1-9]\d*$/.test(waiverVersionRaw)
    ? Number(waiverVersionRaw)
    : null;

  if (!name) return { error: "Name is required." };
  if (!email || !email.includes("@"))
    return { error: "A valid email is required." };
  if ("error" in pronouns) return pronouns;
  if (instagramHandle && !INSTAGRAM_HANDLE_PATTERN.test(instagramHandle)) {
    return {
      error:
        "Instagram handle can only contain letters, numbers, periods, and underscores.",
    };
  }

  const party_size = partySizeRaw ? Number(partySizeRaw) : 1;
  if (!Number.isInteger(party_size) || party_size < 1) {
    return { error: "Party size must be at least 1." };
  }

  return {
    data: {
      name,
      email,
      phone: phone || null,
      instagram_handle: instagramHandle || null,
      pronouns: pronouns.pronouns,
      party_size,
      notes: notes || null,
      attended_before,
      waiver_accepted,
      waiver_version,
    },
  };
}

export type RegistrationEligibility =
  { open: true } | { open: false; reason: string };

export function checkRegistrationWindow(
  event: {
    registration_enabled: boolean;
    registration_deadline: string | null;
  },
  now: Date = new Date(),
): RegistrationEligibility {
  if (!event.registration_enabled) {
    return { open: false, reason: "Registration is not open for this event." };
  }
  if (
    event.registration_deadline &&
    new Date(event.registration_deadline) < now
  ) {
    return {
      open: false,
      reason: "The registration deadline for this event has passed.",
    };
  }
  return { open: true };
}
