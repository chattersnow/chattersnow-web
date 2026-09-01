// Rider profile vocabulary (issue #563). Shared by the public post-registration
// prompt and the portal person form, so it lives here rather than inside either
// route group. Values must stay in sync with the CHECK constraints in
// supabase/migrations/20260901050000_add_rider_profile_to_people.sql.

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

// Where Chatter runs meetups (NY/NJ and the surrounding East Coast). The form
// also offers "Other", which reveals a free-text box -- the typed value is what
// gets stored, never the literal "Other", so the column stays a plain text
// answer rather than a closed set.
export const PREFERRED_MOUNTAINS = [
  "Big Snow (American Dream)",
  "Mountain Creek",
  "Camelback",
  "Blue Mountain",
  "Shawnee",
  "Jack Frost / Big Boulder",
  "Hunter",
  "Windham",
  "Belleayre",
  "Mount Snow",
  "Stratton",
] as const;

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
