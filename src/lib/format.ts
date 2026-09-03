export function formatRoleLabel(name: string): string {
  const spaced = name.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type DisplayNamePerson = {
  preferred_name?: string | null;
  name?: string | null;
  email?: string | null;
};

export type DisplayNameActor = {
  full_name?: string | null;
  email?: string | null;
};

/**
 * The one display rule for a person anywhere in the portal:
 * preferred_name -> name -> email -> fallback.
 *
 * Uses `||` rather than `??` on purpose. `??` only guards null/undefined, so
 * an empty-string preferred_name -- a cleared input that reached the database
 * as "" rather than null, or a provider that supplied full_name: "" -- would
 * render as blank text. `||` skips it.
 *
 * Fields are optional so a surface whose query hasn't been widened to select
 * preferred_name degrades to the legal name rather than to the fallback.
 */
export function personDisplayName(
  person: DisplayNamePerson | null | undefined,
  fallback = "—",
): string {
  if (!person) return fallback;
  return (
    person.preferred_name?.trim() ||
    person.name?.trim() ||
    person.email?.trim() ||
    fallback
  );
}

/**
 * The same rule for an auth actor (an audit stamp such as submitted_by or
 * status_changed_by), where the only name available is auth metadata. Pass a
 * fallback where a more debuggable one exists than "—" -- e.g. the actor's
 * user id on the expense detail view.
 */
export function actorDisplayName(
  actor: DisplayNameActor | null | undefined,
  fallback = "—",
): string {
  if (!actor) return fallback;
  return actor.full_name?.trim() || actor.email?.trim() || fallback;
}
