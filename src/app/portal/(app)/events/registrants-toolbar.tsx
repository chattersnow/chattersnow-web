"use client";

import { AddRegistrantDialog } from "./add-registrant-dialog";
import { CheckInWalkInDialog } from "./check-in-walkin-dialog";

/**
 * The registrant create actions, as one unit.
 *
 * They render in two places now -- the card header and the "View all" sheet
 * header -- because the sheet hosts the check-in loop, and being unable to add
 * the walk-in standing in front of you without closing the list first is the
 * classic reason a modal copy of a table feels worse than the table.
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
