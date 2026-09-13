/**
 * Where one person's portal email is delivered (#1042).
 *
 * `people.email` is an identity key first and a mailbox second: sign-in binds
 * an account to a directory record on it (`resolve_current_person_id`), it is
 * unique per tenant, and People > Duplicates matches on it. Somebody who signs
 * in with a personal Google account can therefore only move their mail by
 * changing what identifies them -- which is why `notification_email` exists,
 * and why every sender resolves an address through here rather than reading a
 * column. A null override, the normal case, is the sign-in address.
 *
 * The SQL side of the same rule is `people_with_permission()`
 * (20260914010000), which returns the coalesce in its `email` column for the
 * sessionless senders that cannot call into this module.
 */
export function deliveryAddress(person: {
  email: string;
  notification_email: string | null;
}): string;
export function deliveryAddress(person: {
  email: string | null;
  notification_email: string | null;
}): string | null;
export function deliveryAddress(person: {
  email: string | null;
  notification_email: string | null;
}): string | null {
  // `||` rather than `??`: an empty override is not an address, and an empty
  // To: is a delivery failure. The column is normalized to null by a trigger
  // (20260914010000), so this only matters if something ever bypasses it.
  return person.notification_email || person.email;
}
