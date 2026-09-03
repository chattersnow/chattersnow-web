import {
  isExperienceLevel,
  isRidingDiscipline,
  ridesSki,
  ridesSnowboard,
  type ExperienceLevel,
  type RidingDiscipline,
} from "@/lib/rider-profile";

const INSTAGRAM_HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

/** The manual role assertions behind the form's role checkboxes. */
export type PersonRoleTag = "donor" | "sponsor" | "volunteer" | "attendee";

/**
 * The role columns are no longer written directly: since
 * 20260903010000_sync_person_role_flags they are recomputed from the records
 * that create each role, unioned with these manual tags, so a column write
 * would just be erased by the next recompute. The parsed form therefore
 * carries the checkbox state separately from the person's own columns.
 */
export type ParsedPersonForm = {
  data: PersonFormData;
  roles: PersonRoleTag[];
};

export type PersonFormData = {
  name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  instagram_handle: string | null;
  notes: string | null;
  logo_url: string | null;
  website: string | null;
  is_organization: boolean;
  riding_discipline: RidingDiscipline | null;
  ski_experience_level: ExperienceLevel | null;
  snowboard_experience_level: ExperienceLevel | null;
  preferred_mountain: string | null;
};

export function parsePersonForm(
  formData: FormData,
): { error: string } | ParsedPersonForm {
  const name = String(formData.get("name") ?? "").trim();
  const preferredName = String(formData.get("preferredName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const instagramHandle = String(formData.get("instagramHandle") ?? "")
    .trim()
    .replace(/^@/, "");
  const notes = String(formData.get("notes") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const is_donor =
    formData.get("isDonor") === "on" || formData.get("isDonor") === "true";
  const is_sponsor =
    formData.get("isSponsor") === "on" || formData.get("isSponsor") === "true";
  const is_volunteer =
    formData.get("isVolunteer") === "on" ||
    formData.get("isVolunteer") === "true";
  const is_organization =
    formData.get("isOrganization") === "on" ||
    formData.get("isOrganization") === "true";
  const is_attendee =
    formData.get("isAttendee") === "on" ||
    formData.get("isAttendee") === "true";
  const ridingDiscipline = String(
    formData.get("ridingDiscipline") ?? "",
  ).trim();
  const skiLevel = String(formData.get("skiExperienceLevel") ?? "").trim();
  const snowboardLevel = String(
    formData.get("snowboardExperienceLevel") ?? "",
  ).trim();
  const preferredMountain = String(
    formData.get("preferredMountain") ?? "",
  ).trim();

  if (!name) return { error: "Name is required." };
  if (!is_donor && !is_sponsor && !is_volunteer && !is_attendee) {
    return {
      error:
        "Select at least one role for this person — Donor, Sponsor, Volunteer, or Attendee.",
    };
  }
  if (instagramHandle && !INSTAGRAM_HANDLE_PATTERN.test(instagramHandle)) {
    return {
      error:
        "Instagram handle can only contain letters, numbers, periods, and underscores.",
    };
  }
  if (logoUrl && !/^https?:\/\//i.test(logoUrl)) {
    return { error: "Logo URL must start with http:// or https://." };
  }
  if (website && !/^https?:\/\//i.test(website)) {
    return { error: "Website must start with http:// or https://." };
  }
  if (ridingDiscipline && !isRidingDiscipline(ridingDiscipline)) {
    return { error: "Select a valid riding discipline." };
  }

  // The rider profile is optional here (staff may only know part of it), but
  // a level for a discipline they don't ride is dropped rather than stored --
  // the DB constrains the same pairing.
  const riding_discipline = isRidingDiscipline(ridingDiscipline)
    ? ridingDiscipline
    : null;

  const roles: PersonRoleTag[] = [];
  if (is_donor) roles.push("donor");
  if (is_sponsor) roles.push("sponsor");
  if (is_volunteer) roles.push("volunteer");
  if (is_attendee) roles.push("attendee");

  return {
    roles,
    data: {
      name,
      preferred_name: preferredName || null,
      email: email || null,
      phone: phone || null,
      instagram_handle: instagramHandle || null,
      notes: notes || null,
      logo_url: logoUrl || null,
      website: website || null,
      is_organization,
      riding_discipline,
      ski_experience_level:
        ridesSki(riding_discipline) && isExperienceLevel(skiLevel)
          ? skiLevel
          : null,
      snowboard_experience_level:
        ridesSnowboard(riding_discipline) && isExperienceLevel(snowboardLevel)
          ? snowboardLevel
          : null,
      preferred_mountain: preferredMountain || null,
    },
  };
}
