"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  listEventRegistrantsAction,
  type EventRegistrant,
} from "./registrants-actions";
import { getEventImpactDerivedAction } from "./impact-derived-actions";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import type { EventImpactDerived } from "@/lib/portal/impact-metrics";
import { useTabData, type TabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";

/**
 * A read several cards in the same phase need.
 *
 * Opening a phase mounts every one of its cards at once, so a read declared
 * here is fetched once by the provider instead of once per card. Add a
 * resource the moment a second card wants the same rows; anything only one
 * card reads stays in that card.
 */
export type SharedEventResource = "registrants" | "impactDerived" | "people";

export type EventPhaseData = {
  registrants: TabData<EventRegistrant[]>;
  impactDerived: TabData<EventImpactDerived>;
  people: TabData<PersonListItem[]>;
  /**
   * Appends a person created from a picker so every card in the phase can
   * select them without waiting for a refetch.
   */
  addLocalPerson: (person: PersonListItem) => void;
};

const EMPTY: TabData<never> = {
  data: undefined,
  loadError: null,
  refresh: () => {},
};

// Cards also render standalone in their own tests, and the phases that don't
// declare a resource never read it, so an unprovided slice reads as "still
// loading" rather than throwing -- the same reasoning as NOOP_API in
// use-tab-refresh.tsx.
const NOT_PROVIDED: EventPhaseData = {
  registrants: EMPTY,
  impactDerived: EMPTY,
  people: EMPTY,
  addLocalPerson: () => {},
};

const EventPhaseDataContext = createContext<EventPhaseData>(NOT_PROVIDED);

export function useEventPhaseData(): EventPhaseData {
  return useContext(EventPhaseDataContext);
}

export function EventPhaseDataProvider({
  eventId,
  resources,
  children,
}: {
  eventId: string;
  resources: readonly SharedEventResource[];
  children: ReactNode;
}) {
  const router = useRouter();
  const wants = (resource: SharedEventResource) => resources.includes(resource);

  const registrants = useTabData<EventRegistrant[]>(
    () => listEventRegistrantsAction(eventId),
    [eventId],
    wants("registrants"),
  );
  const impactDerived = useTabData<EventImpactDerived>(
    () => getEventImpactDerivedAction(eventId),
    [eventId],
    wants("impactDerived"),
  );
  const fetchedPeople = useTabData<PersonListItem[]>(
    () => listPeopleAction(),
    [],
    wants("people"),
  );

  const [localPeople, setLocalPeople] = useState<PersonListItem[]>([]);
  const people: TabData<PersonListItem[]> = {
    ...fetchedPeople,
    data: fetchedPeople.data && [...fetchedPeople.data, ...localPeople],
  };

  // Toolbar actions notify the tab they belong to; these are the shared reads
  // each of those tabs invalidates. Checking someone in changes the derived
  // figures the Attendance card shows, and assigning a discount code changes
  // the subsidized-ticket count, so both reach past their own card.
  useRegisterTabRefresh<TabValue>("registrants", () => {
    registrants.refresh();
    impactDerived.refresh();
    // A walk-in check-in can create a person, so the server-rendered parts of
    // the page get a chance to catch up too -- as the card used to do itself.
    router.refresh();
  });
  useRegisterTabRefresh<TabValue>("discount-codes", impactDerived.refresh);
  // The Add sponsor / Add staff / Add volunteer dialogs can each create a
  // person, which every picker in the phase should then be able to find.
  useRegisterTabRefresh<TabValue>("sponsors", fetchedPeople.refresh);
  useRegisterTabRefresh<TabValue>("staff", fetchedPeople.refresh);
  useRegisterTabRefresh<TabValue>("volunteers", fetchedPeople.refresh);

  return (
    <EventPhaseDataContext.Provider
      value={{
        registrants,
        impactDerived,
        people,
        addLocalPerson: (person) => setLocalPeople((prev) => [...prev, person]),
      }}
    >
      {children}
    </EventPhaseDataContext.Provider>
  );
}
