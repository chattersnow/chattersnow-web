// Rider profile vocabulary (issue #563). Shared by the public registration
// forms (#1415) and the portal person form, so it lives here rather than
// inside either route group. Values must stay in sync with the CHECK
// constraints in supabase/migrations/20260901050000_add_rider_profile_to_people.sql.

export const RIDING_DISCIPLINES = [
  { value: "ski", label: "Skis" },
  { value: "snowboard", label: "Snowboard" },
  { value: "both", label: "Both" },
] as const;

export type RidingDiscipline = (typeof RIDING_DISCIPLINES)[number]["value"];

export const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number]["value"];

// The rider profile is an add-on module (#1408), on for Chatter Snow and off
// for everyone else. `rider_profiles` is the permission it owns, so a portal
// check for it also answers false on a tenant without the module.
export const RIDER_PROFILE_MODULE = "rider_profile";

// Where a tenant runs meetups is its own list, `rider_profile.preferred_mountains`
// in app_settings, edited from the Events page (#1408). The pickers also offer
// "Other", which reveals a free-text box -- the typed value is what gets
// stored, never the literal "Other", so the column stays a plain text answer
// rather than a closed set, and editing the list never rewrites an answer.
// The limits match set_rider_profile_mountains().
export const MAX_MOUNTAINS = 50;
export const MAX_MOUNTAIN_NAME_LENGTH = 80;

/** What registration's riding questions need (#1415); null where not asked. */
export type PublicRiderProfile = { mountains: string[] };

/** A stored mountain list, read defensively: anything but strings is dropped. */
export function parseMountainList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (name): name is string => typeof name === "string" && name.trim() !== "",
  );
}

export const OTHER_MOUNTAIN = "Other";

export function isRidingDiscipline(value: string): value is RidingDiscipline {
  return RIDING_DISCIPLINES.some((option) => option.value === value);
}

export function isExperienceLevel(value: string): value is ExperienceLevel {
  return EXPERIENCE_LEVELS.some((option) => option.value === value);
}

export function ridesSki(discipline: string | null): boolean {
  return discipline === "ski" || discipline === "both";
}

export function ridesSnowboard(discipline: string | null): boolean {
  return discipline === "snowboard" || discipline === "both";
}

export function ridingDisciplineLabel(value: string | null): string | null {
  return (
    RIDING_DISCIPLINES.find((option) => option.value === value)?.label ?? null
  );
}

export function experienceLevelLabel(value: string | null): string | null {
  return (
    EXPERIENCE_LEVELS.find((option) => option.value === value)?.label ?? null
  );
}

/**
 * The mountain list editor's text, one name per line, checked the way
 * set_rider_profile_mountains() will check it -- so the editor can say which
 * line is wrong rather than relaying a database code. Blank lines are dropped;
 * everything else must be a distinct name that is not "Other".
 */
export function parseMountainInput(
  text: string,
): { mountains: string[] } | { error: string } {
  const mountains = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");

  if (mountains.length > MAX_MOUNTAINS) {
    return { error: `List up to ${MAX_MOUNTAINS} mountains.` };
  }
  const seen = new Set<string>();
  for (const name of mountains) {
    if (name.length > MAX_MOUNTAIN_NAME_LENGTH) {
      return {
        error: `“${name.slice(0, 30)}…” is too long. Keep each name to ${MAX_MOUNTAIN_NAME_LENGTH} characters.`,
      };
    }
    const key = name.toLowerCase();
    if (key === OTHER_MOUNTAIN.toLowerCase()) {
      return {
        error: `Leave “${OTHER_MOUNTAIN}” out. It is always offered last, with a box to type a name in.`,
      };
    }
    if (seen.has(key)) {
      return { error: `“${name}” is listed twice.` };
    }
    seen.add(key);
  }
  return { mountains };
}
