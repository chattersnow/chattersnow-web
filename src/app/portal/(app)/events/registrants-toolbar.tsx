"use client";

import { AddRegistrantDialog } from "./add-registrant-dialog";
import { CheckInWalkInDialog } from "./check-in-walkin-dialog";

/**
 * The registrant create actions, as one unit.
 *
 * They render beside the list wherever the door works through it -- the card
 * header and the Happening Now check-in sheet -- because being unable to add
 * the walk-in standing in front of you without leaving the list first is the
 * classic reason a copy of a table feels worse than the table. The
 * registrants page (#1511) renders the two dialogs itself, with the walk-in as
 * its primary action.
 */
export function RegistrantsToolbar({
  eventId,
  onSaved,
}: {
  eventId: string;
  onSaved?: () => void;
}) {
  return (
    <>
      <AddRegistrantDialog eventId={eventId} onSaved={onSaved} />
      <CheckInWalkInDialog eventId={eventId} onSaved={onSaved} />
    </>
  );
}
