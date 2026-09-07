import { describe, expect, test } from "bun:test";
import { parseRiderProfileForm } from "./rider-profile-form";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseRiderProfileForm", () => {
  test("requires a discipline", () => {
    expect(parseRiderProfileForm(formData({}))).toEqual({
      error: "Tell us whether you ski, snowboard, or both.",
    });
  });

  test("rejects an unknown discipline", () => {
    expect(
      parseRiderProfileForm(formData({ ridingDiscipline: "snowshoe" })),
    ).toEqual({ error: "Tell us whether you ski, snowboard, or both." });
  });

  test("requires a ski level when they ski", () => {
    expect(
      parseRiderProfileForm(formData({ ridingDiscipline: "ski" })),
    ).toEqual({ error: "Pick your experience level on skis." });
  });

  test("requires a snowboard level when they snowboard", () => {
    expect(
      parseRiderProfileForm(formData({ ridingDiscipline: "snowboard" })),
    ).toEqual({ error: "Pick your experience level on a snowboard." });
  });

  test("requires both levels when they ride both", () => {
    expect(
      parseRiderProfileForm(
        formData({
          ridingDiscipline: "both",
          skiExperienceLevel: "beginner",
        }),
      ),
    ).toEqual({ error: "Pick your experience level on a snowboard." });
  });

  test("rejects an unknown experience level", () => {
    expect(
      parseRiderProfileForm(
        formData({ ridingDiscipline: "ski", skiExperienceLevel: "expert" }),
      ),
    ).toEqual({ error: "Pick your experience level on skis." });
  });

  test("drops a level for a discipline they don't ride", () => {
    const result = parseRiderProfileForm(
      formData({
        ridingDiscipline: "ski",
        skiExperienceLevel: "advanced",
        snowboardExperienceLevel: "beginner",
      }),
    );

    expect(result).toEqual({
      data: {
        riding_discipline: "ski",
        ski_experience_level: "advanced",
        snowboard_experience_level: null,
        preferred_mountain: null,
      },
    });
  });

  test("stores the typed mountain when 'Other' is chosen", () => {
    const result = parseRiderProfileForm(
      formData({
        ridingDiscipline: "snowboard",
        snowboardExperienceLevel: "intermediate",
        preferredMountain: "Other",
        otherMountain: "Plattekill",
      }),
    );

    expect(result).toEqual({
      data: {
        riding_discipline: "snowboard",
        ski_experience_level: null,
        snowboard_experience_level: "intermediate",
        preferred_mountain: "Plattekill",
      },
    });
  });

  test("treats 'Other' with an empty box as no preference", () => {
    const result = parseRiderProfileForm(
      formData({
        ridingDiscipline: "snowboard",
        snowboardExperienceLevel: "beginner",
        preferredMountain: "Other",
      }),
    );

    expect(result).toEqual({
      data: {
        riding_discipline: "snowboard",
        ski_experience_level: null,
        snowboard_experience_level: "beginner",
        preferred_mountain: null,
      },
    });
  });

  test("parses a full both-disciplines answer", () => {
    const result = parseRiderProfileForm(
      formData({
        ridingDiscipline: "both",
        skiExperienceLevel: "beginner",
        snowboardExperienceLevel: "advanced",
        preferredMountain: "Hunter",
      }),
    );

    expect(result).toEqual({
      data: {
        riding_discipline: "both",
        ski_experience_level: "beginner",
        snowboard_experience_level: "advanced",
        preferred_mountain: "Hunter",
      },
    });
  });
});
