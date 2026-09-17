/**
 * The fixed opening steps every meeting starts with.
 *
 * Lived in `agenda-tab.tsx` until #1199. It is now read by three modules -- the
 * agenda view, the agenda export and `buildMinutesSnapshot` -- and a second
 * copy of the list would mean the minutes could guide a notetaker through steps
 * the agenda never showed.
 *
 * `APPROVE_MINUTES_ITEM` is named rather than inlined because the agenda view
 * swaps that one entry for the approval dialog.
 */
export const APPROVE_MINUTES_ITEM = "Approve previous meeting minutes";

export const OPENING_CHECKLIST = [
  "Welcome and call to order",
  "Confirm quorum",
  APPROVE_MINUTES_ITEM,
  "Review agenda",
];
