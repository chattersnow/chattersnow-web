import type { ParseResult } from "@/lib/forms";

const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

export type EventRegistrationFormData = {
  name: string;
  email: string;
  phone: string | null;
  instagram_handle: string | null;
  party_size: number;
  notes: string | null;
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
  const notes = String(formData.get("notes") ?? "").trim();
  const partySizeRaw = String(formData.get("partySize") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!email || !email.includes("@"))
    return { error: "A valid email is required." };
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
      party_size,
      notes: notes || null,
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
