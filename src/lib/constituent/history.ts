import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A constituent's own history, as the four definer RPCs in
 * `20260916070000_constituent_history.sql` serve it (#1163).
 *
 * The row shapes are declared here rather than taken from
 * `src/lib/database.types.ts`, which is the exception to #813 Phase 1 and
 * worth saying why: the generator types every column of a `returns table`
 * function as non-null, because Postgres carries no nullability through a
 * function's result columns. Three of these four sections are discriminated
 * unions where each `kind` fills only its own columns, so the generated shape
 * would promise a `status` on a row that has none and an `hours` on an
 * application. Believing it is how a page ends up rendering "null" at somebody.
 *
 * Nothing here filters by person, because nothing can: the RPCs take no
 * arguments at all and answer for `auth.uid()` on the request host.
 */

export type MyEventRegistration = {
  registration_id: string;
  event_id: string;
  event_name: string;
  starts_at: string;
  ends_at: string | null;
  /** The event's own zone, which is what the public site displays it in. */
  timezone: string;
  location: string | null;
  party_size: number;
  attended: boolean;
  registered_at: string;
};

export type MyVolunteerEntry = {
  kind: "application" | "signup" | "hours";
  id: string;
  /** An application's moment, or the event a sign-up is for. Null for hours. */
  occurred_at: string | null;
  /** The day hours were logged. Null for the other two kinds. */
  occurred_on: string | null;
  status: string | null;
  role: string | null;
  event_id: string | null;
  event_name: string | null;
  event_timezone: string | null;
  hours: number | null;
};

export type MyGivingEntry = {
  kind: "monetary" | "in_kind";
  id: string;
  received_on: string;
  /** Money only. */
  amount: number | null;
  /** In-kind only: what the donation brought in. */
  items: string[] | null;
  event_id: string | null;
  event_name: string | null;
};

export type MyGearEntry = {
  kind: "request" | "received";
  id: string;
  occurred_at: string;
  status: string | null;
  delivery_method: string | null;
  quoted_amount: number | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  /** The requester's own note, on a request. */
  note: string | null;
  items: string[] | null;
  quantity: number | null;
};

export type MyHistory = {
  events: MyEventRegistration[];
  volunteering: MyVolunteerEntry[];
  giving: MyGivingEntry[];
  gear: MyGearEntry[];
};

export const EMPTY_HISTORY: MyHistory = {
  events: [],
  volunteering: [],
  giving: [],
  gear: [],
};

/**
 * Every section, in one wave.
 *
 * A section whose module the tenant has turned off comes back empty from the
 * database rather than being skipped here -- the gate is in
 * `my_history_person_id()`, where a curl request meets it too. The page shows
 * a section only when it has rows, so an entitlement change needs no second
 * check on this side.
 *
 * A failed read is logged and returns nothing for that section. The
 * alternative -- failing the page -- would take the other three down with it,
 * and "we could not load your donations" is a worse answer than a page that is
 * honestly missing a section nobody promised.
 */
export async function getMyHistory(
  supabase: SupabaseClient,
): Promise<MyHistory> {
  const [events, volunteering, giving, gear] = await Promise.all([
    read<MyEventRegistration>(supabase, "my_event_history"),
    read<MyVolunteerEntry>(supabase, "my_volunteer_history"),
    read<MyGivingEntry>(supabase, "my_giving_history"),
    read<MyGearEntry>(supabase, "my_gear_history"),
  ]);
  return { events, volunteering, giving, gear };
}

async function read<T>(
  supabase: SupabaseClient,
  rpc:
    | "my_event_history"
    | "my_volunteer_history"
    | "my_giving_history"
    | "my_gear_history",
): Promise<T[]> {
  const { data, error } = await supabase.rpc(rpc);
  if (error) {
    console.error(`[constituent] ${rpc} could not be read`, error);
    return [];
  }
  return (data ?? []) as T[];
}

/**
 * Registrations split into what is still to come and what already happened.
 *
 * Upcoming runs soonest-first and past most-recent-first, which is the same
 * rule stated twice: the nearest thing to now is at the top of each list.
 * `now` is a parameter so a test does not have to move the clock.
 */
export function splitEvents(
  rows: readonly MyEventRegistration[],
  now: Date,
): { upcoming: MyEventRegistration[]; past: MyEventRegistration[] } {
  const upcoming: MyEventRegistration[] = [];
  const past: MyEventRegistration[] = [];
  for (const row of rows) {
    // The end, where there is one: a two-day event is still upcoming on its
    // second morning, and somebody checking where to be today should see it.
    const over =
      new Date(row.ends_at ?? row.starts_at).getTime() < now.getTime();
    (over ? past : upcoming).push(row);
  }
  upcoming.reverse();
  return { upcoming, past };
}

export type VolunteerHistory = {
  applications: MyVolunteerEntry[];
  signups: MyVolunteerEntry[];
  hours: MyVolunteerEntry[];
  totalHours: number;
  /** Hours by the role they were logged under, largest first. */
  byRole: { role: string; hours: number }[];
};

/** The one set the RPC returns, grouped the way the section reads it. */
export function groupVolunteering(
  rows: readonly MyVolunteerEntry[],
): VolunteerHistory {
  const applications = rows.filter((row) => row.kind === "application");
  const signups = rows.filter((row) => row.kind === "signup");
  const hours = rows.filter((row) => row.kind === "hours");

  const totals = new Map<string, number>();
  let totalHours = 0;
  for (const entry of hours) {
    const amount = Number(entry.hours ?? 0);
    totalHours += amount;
    // Hours with no role resolve to no role rather than to a guess. They are
    // still in the total, which is the number a volunteer came for.
    if (!entry.role) continue;
    totals.set(entry.role, (totals.get(entry.role) ?? 0) + amount);
  }

  return {
    applications,
    signups,
    hours,
    totalHours,
    byRole: [...totals]
      .map(([role, value]) => ({ role, hours: value }))
      .sort((a, b) => b.hours - a.hours || a.role.localeCompare(b.role)),
  };
}

export type GivingHistory = {
  monetary: MyGivingEntry[];
  inKind: MyGivingEntry[];
  monetaryTotal: number;
};

export function groupGiving(rows: readonly MyGivingEntry[]): GivingHistory {
  const monetary = rows.filter((row) => row.kind === "monetary");
  return {
    monetary,
    inKind: rows.filter((row) => row.kind === "in_kind"),
    monetaryTotal: monetary.reduce(
      (sum, row) => sum + Number(row.amount ?? 0),
      0,
    ),
  };
}

export type GearHistory = {
  requests: MyGearEntry[];
  received: MyGearEntry[];
};

export function groupGear(rows: readonly MyGearEntry[]): GearHistory {
  return {
    requests: rows.filter((row) => row.kind === "request"),
    received: rows.filter((row) => row.kind === "received"),
  };
}

/** How a record reads to the person it is about. */
export type Standing = {
  label: string;
  /** `done` happened, `open` is still moving, `closed` will not move again. */
  tone: "done" | "open" | "closed";
};

/**
 * A volunteer application's six internal statuses, as three the applicant can
 * act on.
 *
 * `new`, `being reviewed` and `contacted` are one fact to the person who
 * applied -- somebody is looking at it -- and which of the three it is says
 * more about the coordinator's queue than about them. The ticket asks only
 * that a pending application say so, and this is what saying so looks like
 * without handing a workflow state to a reader who cannot use it.
 *
 * `declined` and `closed` land together on purpose. A refusal is a
 * conversation the organization has already had, or should have; this page is
 * not where somebody finds out, and "Declined" in a badge is a worse way to
 * learn it than any of the alternatives.
 */
export function volunteerApplicationStanding(status: string | null): Standing {
  switch (status) {
    case "placed":
      return { label: "Accepted", tone: "done" };
    case "declined":
    case "closed":
      return { label: "Closed", tone: "closed" };
    default:
      return { label: "Being reviewed", tone: "open" };
  }
}

/**
 * A gear request's status in the requester's words rather than the queue's.
 *
 * `gearRequestStatusLabel` is the staff vocabulary -- New, Quoted, Fulfilled
 * -- and every one of those words describes the request from the organization's
 * side. The person who asked wants to know whether anything is theirs to do:
 * postage to pay, or nothing but waiting.
 */
export function gearRequestStanding(status: string | null): Standing {
  switch (status) {
    case "fulfilled":
      return { label: "Handed over", tone: "done" };
    case "cancelled":
      return { label: "Cancelled", tone: "closed" };
    case "quoted":
      return { label: "Postage to pay", tone: "open" };
    case "paid":
      return { label: "Paid, on its way", tone: "open" };
    default:
      // `new`, and anything a later migration adds. Not "Received", which is
      // the word this page already uses for gear actually handed over.
      return { label: "Being prepared", tone: "open" };
  }
}

/**
 * Whether there is anything at all to show.
 *
 * The common case on a freshly linked account, and the page says so in one
 * sentence rather than stacking four empty cards -- somebody who has attended
 * one event should get a page that reads as complete, not as broken.
 */
export function isHistoryEmpty(history: MyHistory): boolean {
  return (
    history.events.length === 0 &&
    history.volunteering.length === 0 &&
    history.giving.length === 0 &&
    history.gear.length === 0
  );
}
