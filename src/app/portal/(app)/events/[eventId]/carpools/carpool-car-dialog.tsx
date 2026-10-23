"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { PortalFormPopup } from "@/components/portal/portal-form-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { runAction } from "@/components/portal/action-toast";
import {
  CARPOOL_LABEL_MAX_LENGTH,
  CARPOOL_SEATS_MAX,
  CARPOOL_SEATS_MIN,
  CARPOOL_TEXT_MAX_LENGTH,
  type CarpoolCar,
} from "@/lib/event-carpools";
import { saveCarpoolCarAction } from "../../carpools-actions";

const NO_DRIVER = "__none__";

/** Someone who could drive: an active registrant in no car, or this car's driver. */
export type DriverChoice = {
  registrationId: string;
  name: string;
  /** Their answer to the event's seats question, when it is usable. */
  seats: number | null;
};

/**
 * Add or edit a car (#1649). Choosing a driver prefills the seats from their
 * answer to the event's seats question, when the event names one; otherwise
 * the seats are typed.
 */
export function CarpoolCarDialog({
  eventId,
  car,
  nextLabel,
  driverChoices,
  open,
  onOpenChange,
  onSaved,
}: {
  eventId: string;
  /** Null adds a car. */
  car: CarpoolCar | null;
  /** The placeholder for a new car's name: "Car 3". */
  nextLabel: string;
  driverChoices: readonly DriverChoice[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(car?.label ?? "");
  const [driverId, setDriverId] = useState(
    car?.driver?.registrationId ?? NO_DRIVER,
  );
  const [seats, setSeats] = useState(car ? String(car.seats) : "");
  const [leavingFrom, setLeavingFrom] = useState(car?.leavingFrom ?? "");
  const [notes, setNotes] = useState(car?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function chooseDriver(value: string) {
    setDriverId(value);
    const choice = driverChoices.find((row) => row.registrationId === value);
    if (choice?.seats != null) setSeats(String(choice.seats));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const seatCount = Number(seats);
    if (
      !Number.isInteger(seatCount) ||
      seatCount < CARPOOL_SEATS_MIN ||
      seatCount > CARPOOL_SEATS_MAX
    ) {
      setError(
        `Seats must be a whole number from ${CARPOOL_SEATS_MIN} to ${CARPOOL_SEATS_MAX}.`,
      );
      return;
    }
    setError(null);
    startTransition(async () => {
      await runAction(
        () =>
          saveCarpoolCarAction({
            eventId,
            carId: car?.id ?? null,
            label,
            driverRegistrationId: driverId === NO_DRIVER ? null : driverId,
            seats: seatCount,
            leavingFrom,
            notes,
          }),
        {
          success: car
            ? `${label.trim() || car.label} saved.`
            : `${label.trim() || nextLabel} added.`,
          onError: setError,
          onSuccess: () => {
            onOpenChange(false);
            onSaved();
          },
        },
      );
    });
  }

  const idPrefix = car ? `carpool-car-${car.id}` : "carpool-car-new";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <PortalFormPopup
        size="md"
        title={car ? `Edit ${car.label}` : "Add a car"}
        description="Who drives, and how many passenger seats the car has."
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-label`}>Name</FieldLabel>
              <Input
                id={`${idPrefix}-label`}
                maxLength={CARPOOL_LABEL_MAX_LENGTH}
                placeholder={car?.label ?? nextLabel}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-driver`}>Driver</FieldLabel>
              <Select
                value={driverId}
                onValueChange={(value) => chooseDriver(value ?? NO_DRIVER)}
              >
                <SelectTrigger id={`${idPrefix}-driver`} className="w-full">
                  <SelectValue placeholder="No driver yet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DRIVER}>No driver yet</SelectItem>
                  {driverChoices.map((choice) => (
                    <SelectItem
                      key={choice.registrationId}
                      value={choice.registrationId}
                    >
                      {choice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Registrants not already in a car.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-seats`}>
                Seats for passengers
              </FieldLabel>
              <Input
                id={`${idPrefix}-seats`}
                type="number"
                inputMode="numeric"
                min={CARPOOL_SEATS_MIN}
                max={CARPOOL_SEATS_MAX}
                step={1}
                required
                value={seats}
                onChange={(event) => setSeats(event.target.value)}
                className="w-28"
              />
              <FieldDescription>
                Not counting the driver. A party takes as many seats as its
                size.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-leaving`}>
                Leaving from
              </FieldLabel>
              <Input
                id={`${idPrefix}-leaving`}
                maxLength={CARPOOL_TEXT_MAX_LENGTH}
                value={leavingFrom}
                onChange={(event) => setLeavingFrom(event.target.value)}
              />
              <FieldDescription>
                The people in this car see this with their assignment.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-notes`}>Notes</FieldLabel>
              <Textarea
                id={`${idPrefix}-notes`}
                maxLength={CARPOOL_TEXT_MAX_LENGTH}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
              <FieldDescription>Only staff see these.</FieldDescription>
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {car ? "Save car" : "Add car"}
            </Button>
          </div>
        </form>
      </PortalFormPopup>
    </Dialog>
  );
}
