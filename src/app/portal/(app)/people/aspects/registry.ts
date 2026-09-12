import { ASPECT_ACTIONS } from "./aspect-actions";
import { AttendeeCard } from "./attendee-card";
import { PartnerCard } from "./partner-card";
import { DonorCard } from "./donor-card";
import { SponsorCard } from "./sponsor-card";
import { StaffCard } from "./staff-card";
import { VolunteerCard } from "./volunteer-card";
import type { PersonAspect } from "./types";

/**
 * Every per-role behaviour on a person record, in ROLE_OPTIONS order so the
 * detail page and the Roles column agree.
 *
 * The labels are `{term}` templates in the tenant's own vocabulary (#911) --
 * a studio's staff are its instructors -- and the page resolves them before
 * anything renders one. The keys are not: they are the flags on
 * `people_with_roles`.
 *
 * Adding a type is a card file, an ASPECT_ACTIONS entry, and one line here.
 * Staff (#626) was the first to go through the seam and needed nothing else;
 * Partner was the second, and the first to arrive by moving an existing
 * standalone card ([id]/partnerships-card.tsx) into the registry.
 */
export const PERSON_ASPECTS: readonly PersonAspect[] = [
  {
    key: "is_donor",
    label: "{donor}",
    HistoryCard: DonorCard,
    actions: ASPECT_ACTIONS.is_donor,
  },
  {
    key: "is_sponsor",
    label: "{sponsor}",
    HistoryCard: SponsorCard,
    actions: ASPECT_ACTIONS.is_sponsor,
  },
  {
    key: "is_volunteer",
    label: "{volunteer}",
    HistoryCard: VolunteerCard,
    actions: ASPECT_ACTIONS.is_volunteer,
  },
  {
    key: "is_attendee",
    label: "{attendee}",
    HistoryCard: AttendeeCard,
    actions: ASPECT_ACTIONS.is_attendee,
  },
  {
    key: "is_staff",
    label: "{staff}",
    HistoryCard: StaffCard,
    actions: ASPECT_ACTIONS.is_staff,
  },
  {
    key: "is_partner",
    label: "{partner}",
    HistoryCard: PartnerCard,
    actions: ASPECT_ACTIONS.is_partner,
  },
];
