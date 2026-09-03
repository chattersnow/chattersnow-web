import { ASPECT_ACTIONS } from "./aspect-actions";
import { AttendeeCard } from "./attendee-card";
import { DonorCard } from "./donor-card";
import { SponsorCard } from "./sponsor-card";
import { VolunteerCard } from "./volunteer-card";
import type { PersonAspect } from "./types";

/**
 * Every per-role behaviour on a person record, in ROLE_OPTIONS order so the
 * detail page and the Roles column agree.
 *
 * Adding a type -- Staff is specced in technical-spec section 5.9 -- is a card
 * file, an ASPECT_ACTIONS entry, and one line here. No shared file changes.
 */
export const PERSON_ASPECTS: readonly PersonAspect[] = [
  {
    key: "is_donor",
    label: "Donor",
    HistoryCard: DonorCard,
    actions: ASPECT_ACTIONS.is_donor,
  },
  {
    key: "is_sponsor",
    label: "Sponsor",
    HistoryCard: SponsorCard,
    actions: ASPECT_ACTIONS.is_sponsor,
  },
  {
    key: "is_volunteer",
    label: "Volunteer",
    HistoryCard: VolunteerCard,
    actions: ASPECT_ACTIONS.is_volunteer,
  },
  {
    key: "is_attendee",
    label: "Attendee",
    HistoryCard: AttendeeCard,
    actions: ASPECT_ACTIONS.is_attendee,
  },
];
