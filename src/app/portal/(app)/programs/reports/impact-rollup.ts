// The impact metric definitions moved to src/lib/portal/impact-metrics.ts so the
// per-event Impact card and this program rollup compute every figure with the
// same functions instead of two implementations that agree only by comment.
// This module stays as the reports page's import surface.
export {
  toNumber,
  sumDistributedQuantity,
  sumVolunteerHours,
  countRepeatParticipants,
  countCheckedIn,
  computeParticipants,
  computeFirstTimeParticipants,
  countSubsidizedTickets,
  countVolunteerParticipants,
  countBeginnerParticipants,
  countProfiledAttendees,
  computeProgramImpactRollup,
} from "@/lib/portal/impact-metrics";

export type {
  ImpactNoteRow,
  DistributedMovementRow,
  VolunteerHoursRow,
  RegistrationRow,
  EventRow,
  CheckinCountRow,
  DiscountCodeRow,
  PersonEventRow,
  ProgramImpactRollup,
  ProgramImpactRollupInput,
} from "@/lib/portal/impact-metrics";
