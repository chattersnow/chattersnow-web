"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { utcIsoToDateInZone, utcIsoToDatetimeLocalInZone } from "@/lib/time";

/**
 * The event's own dates, pre-formatted for the two date inputs a form uses.
 *
 * Every date a form records inside an event -- an expense, a distribution, an
 * incident, a volunteer shift, a giveaway drawing -- happened on the day of
 * the event, not on the day someone got round to typing it in. So a *new*
 * record's date field opens on the event's date rather than on today, and
 * whoever is entering last week's paperwork corrects the exception instead of
 * every row.
 *
 * Two rules keep that from turning into data nobody chose:
 *
 * - Only new records. A form editing a saved row shows what was saved, and a
 *   form editing an existing record's empty optional date leaves it empty --
 *   prefilling there would write a date on the next save that nobody entered.
 * - Only inside an event. These fields are shared with Finance and Inventory,
 *   where the same dialog opens with no event in context; there the provider
 *   is absent, every value is "", and today's default stands.
 *
 * Formatted in the *event's* timezone (`utcIsoToDateInZone`), so an evening
 * event does not open its forms on the following day for a reader whose
 * browser sits east of it.
 */
export type EventDateDefaults = {
  /** The event's start date, "YYYY-MM-DD", for `<input type="date">`. */
  date: string;
  /** The event's start, "YYYY-MM-DDTHH:mm", for `<input type="datetime-local">`. */
  startsAt: string;
  /** The event's end, same shape; "" when the event has no end time. */
  endsAt: string;
};

const NO_EVENT: EventDateDefaults = { date: "", startsAt: "", endsAt: "" };

// Cards and dialogs also render outside an event -- in Finance, in Inventory,
// and in their own tests -- so an unprovided context reads as "no event",
// which every caller already handles by keeping its own default.
const EventDateContext = createContext<EventDateDefaults>(NO_EVENT);

export function useEventDateDefaults(): EventDateDefaults {
  return useContext(EventDateContext);
}

export function EventDateProvider({
  startsAt,
  endsAt,
  timeZone,
  children,
}: {
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
  children: ReactNode;
}) {
  const value = useMemo<EventDateDefaults>(
    () => ({
      date: utcIsoToDateInZone(startsAt, timeZone),
      startsAt: utcIsoToDatetimeLocalInZone(startsAt, timeZone),
      endsAt: endsAt ? utcIsoToDatetimeLocalInZone(endsAt, timeZone) : "",
    }),
    [startsAt, endsAt, timeZone],
  );

  return (
    <EventDateContext.Provider value={value}>
      {children}
    </EventDateContext.Provider>
  );
}
