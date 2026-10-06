import { describe, expect, test } from "bun:test";
import {
  effectiveRider,
  levelTotal,
  ridersLine,
  riderStats,
  type RiderAnswers,
} from "./rider-stats";

function rider(overrides: Partial<RiderAnswers> = {}): RiderAnswers {
  return {
    riding_discipline_at_event: null,
    ski_experience_level_at_event: null,
    snowboard_experience_level_at_event: null,
    riding_discipline: null,
    ski_experience_level: null,
    snowboard_experience_level: null,
    ...overrides,
  };
}

describe("effectiveRider", () => {
  test("reads the person's profile when there is no check-in snapshot", () => {
    expect(
      effectiveRider(
        rider({ riding_discipline: "ski", ski_experience_level: "beginner" }),
      ),
    ).toEqual({ discipline: "ski", ski: "beginner", snowboard: null });
  });

  test("prefers the snapshot, all or nothing", () => {
    expect(
      effectiveRider(
        rider({
          riding_discipline_at_event: "snowboard",
          snowboard_experience_level_at_event: "intermediate",
          riding_discipline: "ski",
          ski_experience_level: "advanced",
        }),
      ),
    ).toEqual({
      discipline: "snowboard",
      ski: null,
      snowboard: "intermediate",
    });
  });

  test("drops values outside the vocabulary", () => {
    expect(effectiveRider(rider({ riding_discipline: "sled" }))).toEqual({
      discipline: null,
      ski: null,
      snowboard: null,
    });
  });
});

describe("riderStats", () => {
  const stats = riderStats([
    rider({ riding_discipline: "ski", ski_experience_level: "beginner" }),
    rider({ riding_discipline: "ski", ski_experience_level: "advanced" }),
    rider({
      riding_discipline: "snowboard",
      snowboard_experience_level: "beginner",
    }),
    rider({
      riding_discipline: "both",
      ski_experience_level: "intermediate",
      snowboard_experience_level: "beginner",
    }),
    rider({ riding_discipline: "snowboard" }),
    rider(),
  ]);

  test("counts disciplines and the unanswered", () => {
    expect(stats.answered).toBe(5);
    expect(stats.unanswered).toBe(1);
    expect(stats.disciplines).toEqual({ ski: 2, snowboard: 2, both: 1 });
  });

  test("counts someone who does both in each discipline's levels", () => {
    expect(stats.ski).toEqual({
      beginner: 1,
      intermediate: 1,
      advanced: 1,
      unknown: 0,
    });
    expect(stats.snowboard).toEqual({
      beginner: 2,
      intermediate: 0,
      advanced: 0,
      unknown: 1,
    });
    expect(levelTotal(stats.ski)).toBe(3);
    expect(levelTotal(stats.snowboard)).toBe(3);
  });

  test("reads as one line for the registrants card", () => {
    expect(ridersLine(stats)).toBe(
      "Skis 3 (1 beginner, 1 intermediate, 1 advanced) · Snowboard 3 (2 beginner, 0 intermediate, 0 advanced)",
    );
  });
});
