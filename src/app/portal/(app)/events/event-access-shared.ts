import type {
  EventAccessArea,
  EventAccessAreaOption,
} from "@/lib/auth/event-access";

export type { EventAccessAreaOption };

/**
 * Types and pure helpers the event's Access card and its actions share
 * (#1689). Its own file so the client card does not import the `"use server"`
 * module for its types.
 */

/** One row of `list_event_access()`. */
export type EventAccessEntry = {
  /** A grant on an account, or an invite to an address with none yet. */
  kind: "grant" | "invite";
  id: string;
  user_id: string | null;
  email: string | null;
  name: string | null;
  level: "view" | "manage";
  areas: EventAccessArea[];
  granted_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type EventAccessState = {
  entries: EventAccessEntry[];
  /** The platform's areas in catalog order, each marked offered or not. */
  areas: EventAccessAreaOption[];
  /** `administration: manage`: may give, change and remove access. */
  canGrant: boolean;
};

/** A tenant account an administrator may pick instead of typing an address. */
export type EventAccessCandidate = {
  user_id: string;
  email: string;
  name: string | null;
};

export type EventAccessInput = {
  level: "view" | "manage";
  areas: EventAccessArea[];
};

/**
 * The areas a fresh grant starts with: every offered area that is not
 * sensitive. A sensitive area the tenant offers is still opted in to per grant
 * (#1685).
 */
export function defaultGrantAreas(
  areas: readonly EventAccessAreaOption[],
): EventAccessArea[] {
  return areas
    .filter((area) => area.offered && !area.sensitive)
    .map((area) => area.key);
}

/**
 * A grant's areas split by whether they reach anything today: an area the
 * tenant stopped offering stays on the grant but gives no access (#1686).
 */
export function splitGrantAreas(
  grantAreas: readonly EventAccessArea[],
  areas: readonly EventAccessAreaOption[],
): { active: EventAccessAreaOption[]; withdrawn: EventAccessAreaOption[] } {
  const on = areas.filter((area) => grantAreas.includes(area.key));
  return {
    active: on.filter((area) => area.offered),
    withdrawn: on.filter((area) => !area.offered),
  };
}

/** What a database refusal from the grant tables means to an administrator. */
export function eventAccessErrorMessage(
  message: string | undefined,
  fallback: string,
): string {
  if (!message) return fallback;
  if (message.includes("EVENT_ACCESS_AREA_NOT_OFFERED")) {
    return "One of those areas isn't offered for event access. An administrator can offer it under Roles → Event access.";
  }
  if (message.includes("EVENT_ACCESS_AREA_UNKNOWN")) {
    return "One of those areas doesn't exist.";
  }
  if (message.includes("EVENT_ACCESS_AREA_DUPLICATE")) {
    return "An area was picked twice.";
  }
  return fallback;
}
