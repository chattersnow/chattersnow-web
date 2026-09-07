// Shared by the public post-registration prompt and the portal's door-side
// capture on the Registrants tab (issue #653), so it lives here rather than
// inside either route group -- same reason as the vocabulary in
// ./rider-profile.
import type { ParseResult } from "@/lib/forms";
import {
  OTHER_MOUNTAIN,
  isExperienceLevel,
  isRidingDiscipline,
  ridesSki,
  ridesSnowboard,
  type ExperienceLevel,
  type RidingDiscipline,
} from "./rider-profile";

export type RiderProfileFormData = {
  riding_discipline: RidingDiscipline;
  ski_experience_level: ExperienceLevel | null;
  snowboard_experience_level: ExperienceLevel | null;
  preferred_mountain: string | null;
};

export function parseRiderProfileForm(
  formData: FormData,
): ParseResult<RiderProfileFormData> {
  const discipline = String(formData.get("ridingDiscipline") ?? "").trim();
  const skiLevel = String(formData.get("skiExperienceLevel") ?? "").trim();
  const snowboardLevel = String(
    formData.get("snowboardExperienceLevel") ?? "",
  ).trim();
  const mountain = String(formData.get("preferredMountain") ?? "").trim();
  const otherMountain = String(formData.get("otherMountain") ?? "").trim();

  if (!isRidingDiscipline(discipline)) {
    return { error: "Tell us whether you ski, snowboard, or both." };
  }

  if (ridesSki(discipline) && !isExperienceLevel(skiLevel)) {
    return { error: "Pick your experience level on skis." };
  }
  if (ridesSnowboard(discipline) && !isExperienceLevel(snowboardLevel)) {
    return { error: "Pick your experience level on a snowboard." };
  }

  // "Other" is a UI affordance for revealing the free-text box; it's never a
  // stored answer, so an empty box just means no preference was given.
  const preferred_mountain =
    mountain === OTHER_MOUNTAIN ? otherMountain : mountain;

  return {
    data: {
      riding_discipline: discipline,
      // Clear the level for a discipline they don't ride, so the value can
      // never contradict the discipline (the DB constrains this too).
      ski_experience_level:
        ridesSki(discipline) && isExperienceLevel(skiLevel) ? skiLevel : null,
      snowboard_experience_level:
        ridesSnowboard(discipline) && isExperienceLevel(snowboardLevel)
          ? snowboardLevel
          : null,
      preferred_mountain: preferred_mountain || null,
    },
  };
}
