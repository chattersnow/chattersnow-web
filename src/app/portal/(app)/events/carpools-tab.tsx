"use client";

import Link from "next/link";
import type { TabData } from "@/hooks/use-tab-data";
import type { EventRegistrantsData } from "./registrants-actions";
import {
  carpoolAssignments,
  carpoolsHref,
  isOverCapacity,
  seatsUsed,
} from "@/lib/event-carpools";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";

/**
 * The event's Carpools card (#1649): how the plan stands, and the way to the
 * board, which is a page of its own. Listed only on an event with Organize
 * carpools on.
 */
export function CarpoolsTab({
  eventId,
  registrants,
}: {
  eventId: string;
  registrants: TabData<EventRegistrantsData>;
}) {
  const { data, loadError } = registrants;
  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (data === undefined) return <TabLoadingSkeleton />;

  const cars = data.carpools?.cars ?? [];
  const assigned = carpoolAssignments(cars);
  const unassigned = data.registrants.filter(
    (row) => !assigned.has(row.id),
  ).length;
  const passengers = cars.flatMap((car) => car.passengers);
  const unpaid = passengers.filter((row) => row.paidAt === null).length;
  const noDriver = cars.filter((car) => !car.driver).length;
  const overFull = cars.filter(isOverCapacity).length;
  const used = cars.reduce((sum, car) => sum + seatsUsed(car), 0);
  const seats = cars.reduce((sum, car) => sum + car.seats, 0);

  const figures = [
    { label: "Cars", value: String(cars.length) },
    { label: "Seats taken", value: `${used} of ${seats}` },
    { label: "Unassigned", value: String(unassigned) },
    { label: "Unpaid", value: String(unpaid) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="flex flex-col gap-1 rounded-lg border px-3 py-2"
          >
            <dt className="app-muted text-xs">{figure.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
      {(noDriver > 0 || overFull > 0) && (
        <p className="text-sm">
          {[
            noDriver > 0 &&
              `${noDriver} ${noDriver === 1 ? "car has" : "cars have"} no driver`,
            overFull > 0 &&
              `${overFull} ${overFull === 1 ? "car is" : "cars are"} over capacity`,
          ]
            .filter(Boolean)
            .join(" · ")}
          .
        </p>
      )}
      <div>
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link href={carpoolsHref(eventId)} />}
        >
          Open carpools
        </Button>
      </div>
    </div>
  );
}
