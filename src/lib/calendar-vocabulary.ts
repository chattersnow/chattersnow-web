/**
 * The `item_type` and category an event carries when it appears as a calendar
 * item, matching what `public_calendar_items` projects events as (#359).
 *
 * These are platform vocabulary rather than a tenant's words: the category
 * *label* is per-tenant since #834, but the key underneath it is the identifier
 * the views and every query join on, so it has to be identical for everyone.
 *
 * They live in `lib` rather than beside the portal calendar because the public
 * home page reads `public_calendar_items` too, and had been spelling the value
 * out as a string literal. When #834 renamed `chatter_event` to `own_event`,
 * that literal kept the old spelling and the filter it fed silently stopped
 * matching anything -- #846's duplicate-event guard, undone six hours after it
 * shipped and caught by the #838 sweep. One exported constant both route groups
 * import is what makes that impossible; two copies of a string is what made it
 * happen.
 */

/** The item_type an event is tagged with, matching `public_calendar_items`. */
export const EVENT_ITEM_TYPE = "own_event";

/** The category an event is tagged with, matching `public_calendar_items`. */
export const EVENT_CATEGORY = "own_events";
