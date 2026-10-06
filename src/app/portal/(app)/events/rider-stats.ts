/**
 * Who is coming on skis and who on a snowboard, and at what level -- the
 * registrants page's Riders breakdown and the answers CSV's rider columns, as
 * pure functions so both read a registration the same way.
 *
 * Counted per registration, not per head: the rider answers are the
 * registrant's own, and nobody was asked how the rest of a party rides.
 */

import type { ExperienceLevel, RidingDiscipline } from "@/lib/rider-profile";
import { isExperienceLevel, isRidingDiscipline } from "@/lib/rider-profile";

/** The columns a registration carries for its rider (#653, #1408). */
export type RiderAnswers = {
  riding_discipline_at_event: string | null;
  ski_experience_level_at_event: string | null;
  snowboard_experience_level_at_event: string | null;
  riding_discipline: string | null;
  ski_experience_level: string | null;
  snowboard_experience_level: string | null;
};

export type EffectiveRider = {
  discipline: RidingDiscipline | null;
  ski: ExperienceLevel | null;
  snowboard: ExperienceLevel | null;
};

/**
 * The level snapshotted at check-in, falling back to the person's current
 * profile only when there is no snapshot at all -- the same all-or-nothing
 * rule the impact RPCs apply, so these figures and the Impact card's beginner
 * figure can never disagree.
 */
export function effectiveRider(rider: RiderAnswers): EffectiveRider {
  const snapshot = rider.riding_discipline_at_event !== null;
  const discipline = snapshot
    ? rider.riding_discipline_at_event
    : rider.riding_discipline;
  const ski = snapshot
    ? rider.ski_experience_level_at_event
    : rider.ski_experience_level;
  const snowboard = snapshot
    ? rider.snowboard_experience_level_at_event
    : rider.snowboard_experience_level;
  return {
    discipline:
      discipline !== null && isRidingDiscipline(discipline) ? discipline : null,
    ski: ski !== null && isExperienceLevel(ski) ? ski : null,
    snowboard:
      snowboard !== null && isExperienceLevel(snowboard) ? snowboard : null,
  };
}

export type LevelCounts = Record<ExperienceLevel, number> & {
  /** Rides this way but no level was recorded. */
  unknown: number;
};

export type RiderStats = {
  /** Registrations with a discipline on record. */
  answered: number;
  unanswered: number;
  disciplines: Record<RidingDiscipline, number>;
  /**
   * Everybody who skis, "both" included, by ski level; likewise snowboard. A
   * registrant who does both is in each, so these two can add up to more
   * than `answered`.
   */
  ski: LevelCounts;
  snowboard: LevelCounts;
};

/** Everybody who rides this way, whatever their level. */
export function levelTotal(levels: LevelCounts): number {
  return (
    levels.beginner + levels.intermediate + levels.advanced + levels.unknown
  );
}

function emptyLevels(): LevelCounts {
  return { beginner: 0, intermediate: 0, advanced: 0, unknown: 0 };
}

export function riderStats(riders: readonly RiderAnswers[]): RiderStats {
  const stats: RiderStats = {
    answered: 0,
    unanswered: 0,
    disciplines: { ski: 0, snowboard: 0, both: 0 },
    ski: emptyLevels(),
    snowboard: emptyLevels(),
  };
  for (const rider of riders) {
    const { discipline, ski, snowboard } = effectiveRider(rider);
    if (discipline === null) {
      stats.unanswered += 1;
      continue;
    }
    stats.answered += 1;
    stats.disciplines[discipline] += 1;
    if (discipline === "ski" || discipline === "both") {
      stats.ski[ski ?? "unknown"] += 1;
    }
    if (discipline === "snowboard" || discipline === "both") {
      stats.snowboard[snowboard ?? "unknown"] += 1;
    }
  }
  return stats;
}

function levelsLine(levels: LevelCounts): string {
  return [
    `${levels.beginner} beginner`,
    `${levels.intermediate} intermediate`,
    `${levels.advanced} advanced`,
  ].join(", ");
}

/**
 * The registrants card's one-line version: `Skis 7 (3 beginner, 2
 * intermediate, 2 advanced) · Snowboard 4 (...)`. Each total includes those
 * who do both, so they can add up to more than the registrations.
 */
export function ridersLine(stats: RiderStats): string {
  return [
    `Skis ${levelTotal(stats.ski)} (${levelsLine(stats.ski)})`,
    `Snowboard ${levelTotal(stats.snowboard)} (${levelsLine(stats.snowboard)})`,
  ].join(" · ");
}
