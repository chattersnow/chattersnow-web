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
 * A read more than one card needs.
 *
 * The provider fetches each of these at most once for the life of the page,
 * so moving between two cards that both want the people list does not fetch it
 * twice. Add a resource the moment a second card wants the same rows; anything
 * only one card reads stays in that card.
 */
export type SharedEventResource = "registrants" | "impactDerived" | "people";

export type EventSharedData = {
  registrants: TabData<EventRegistrant[]>;
  impactDerived: TabData<EventImpactDerived>;
  people: TabData<PersonListItem[]>;
  /**
   * Appends a person created from a picker so every card can select them
   * without waiting for a refetch.
   */
  addLocalPerson: (person: PersonListItem) => void;
};

const EMPTY: TabData<never> = {
  data: undefined,
  loadError: null,
  refresh: () => {},
};

// Cards also render standalone in their own tests, and a card that doesn't
// declare a resource never reads it, so an unprovided slice reads as "still
// loading" rather than throwing -- the same reasoning as NOOP_API in
// use-tab-refresh.tsx.
const NOT_PROVIDED: EventSharedData = {
  registrants: EMPTY,
  impactDerived: EMPTY,
  people: EMPTY,
  addLocalPerson: () => {},
};

const EventSharedDataContext = createContext<EventSharedData>(NOT_PROVIDED);

export function useEventSharedData(): EventSharedData {
  return useContext(EventSharedDataContext);
}

/**
 * The reads shared between cards, fetched lazily and kept.
 *
 * Until #1008 one of these was mounted per phase and Base UI's unmounting of
 * the phases you weren't looking at is what kept exactly one alive. The rail
 * has no phase container, so the provider sits above the single card on screen
 * instead and `resources` names what *that* card reads.
 *
 * Requested resources accumulate rather than following the card, for two
 * reasons: `useTabData` only fetches on a false -> true edge, so a resource
 * that stayed requested is not re-fetched when the reader comes back to a card
 * that needs it; and nothing is fetched until some card actually asks, which
 * is strictly less than the old behaviour of fetching a phase's whole union
 * the moment the phase opened.
 */
export function EventSharedDataProvider({
  eventId,
  resources,
  children,
}: {
  eventId: string;
  resources: readonly SharedEventResource[];
  children: ReactNode;
}) {
  const router = useRouter();

  const [requested, setRequested] = useState<ReadonlySet<SharedEventResource>>(
    () => new Set(resources),
  );
  // Derived from a prop during render rather than in an effect, so the card's
  // first paint already has its fetch enabled instead of waiting a commit.
  const missing = resources.filter((resource) => !requested.has(resource));
  if (missing.length > 0) {
    setRequested(new Set([...requested, ...missing]));
  }
  const wants = (resource: SharedEventResource) =>
    requested.has(resource) || resources.includes(resource);

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
  // The typed headcount is what the derived figures prefer over check-ins, so
  // saving it changes what the Impact card shows. It cost nothing to leave out
  // while a provider was mounted per phase and Attendance and Impact sat in
  // different ones -- moving between them remounted the provider and refetched
  // (#1008). One provider for the page means saying so.
  useRegisterTabRefresh<TabValue>("attendance", impactDerived.refresh);
  // The Add sponsor / Add staff / Add volunteer dialogs can each create a
  // person, which every picker in the phase should then be able to find.
  useRegisterTabRefresh<TabValue>("sponsors", fetchedPeople.refresh);
  useRegisterTabRefresh<TabValue>("staff", fetchedPeople.refresh);
  useRegisterTabRefresh<TabValue>("volunteers", fetchedPeople.refresh);

  return (
    <EventSharedDataContext.Provider
      value={{
        registrants,
        impactDerived,
        people,
        addLocalPerson: (person) => setLocalPeople((prev) => [...prev, person]),
      }}
    >
      {children}
    </EventSharedDataContext.Provider>
  );
}
