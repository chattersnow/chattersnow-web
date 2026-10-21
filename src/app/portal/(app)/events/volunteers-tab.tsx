"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteEventVolunteerAction,
  deleteEventVolunteerHoursAction,
  listEventVolunteerHoursAction,
  listEventVolunteersAction,
  updateEventVolunteerShiftAction,
  type EventVolunteer,
  type EventVolunteerHours,
} from "./volunteers-actions";
import {
  deleteEventShiftAction,
  listEventShiftsAction,
  updateEventShiftAction,
  type EventShift,
} from "./shifts-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTabData } from "@/hooks/use-tab-data";
import { useRegisterTabRefresh } from "@/hooks/use-tab-refresh";
import type { TabValue } from "./event-tabs-config";
import { ShiftsSection } from "./volunteers/shifts";
import { buildRoster, RosterSection } from "./volunteers/roster";
import { runAction } from "@/components/portal/action-toast";
import { VolunteersSummary } from "./card-summaries";

type VolunteersTabData = {
  volunteers: EventVolunteer[];
  hours: EventVolunteerHours[];
  shifts: EventShift[];
};

async function fetchVolunteersTabData(
  eventId: string,
): Promise<{ error: string } | { data: VolunteersTabData }> {
  const [volunteersResult, hoursResult, shiftsResult] = await Promise.all([
    listEventVolunteersAction(eventId),
    listEventVolunteerHoursAction(eventId),
    listEventShiftsAction(eventId),
  ]);

  if ("error" in volunteersResult) {
    return { error: volunteersResult.error };
  }

  return {
    data: {
      volunteers: volunteersResult.data,
      hours: "error" in hoursResult ? [] : hoursResult.data,
      shifts: "error" in shiftsResult ? [] : shiftsResult.data,
    },
  };
}

export function VolunteersTab({
  eventId,
  mode,
  refreshDerived,
}: {
  eventId: string;
  mode: "view" | "edit";
  /** Refetches the Results card's Outcomes, which count volunteers and hours. */
  refreshDerived: () => void;
}) {
  const router = useRouter();
  const {
    data: tabData,
    loadError,
    refresh: refreshTabData,
  } = useTabData<VolunteersTabData>(
    () => fetchVolunteersTabData(eventId),
    [eventId],
  );
  const volunteers = tabData?.volunteers ?? [];
  const hours = tabData?.hours ?? [];
  const shifts = tabData?.shifts ?? [];
  const [isDeleting, startDeleteTransition] = useTransition();

  function refresh() {
    refreshTabData();
    router.refresh();
  }

  useRegisterTabRefresh<TabValue>("volunteers", refresh);

  // The toolbar's notification reaches the shared-data provider, which
  // refreshes the derived figures itself; a change made inside the card
  // doesn't, so it does that here (#1619).
  function refreshAfterChange() {
    refresh();
    refreshDerived();
  }

  function handleDeleteVolunteer(id: string) {
    startDeleteTransition(async () => {
      await runAction(() => deleteEventVolunteerAction(id), {
        success: "Volunteer removed.",
        error: "Could not remove the volunteer. Please try again.",
        onSuccess: refreshAfterChange,
      });
    });
  }

  function handleDeleteHours(id: string) {
    startDeleteTransition(async () => {
      await runAction(() => deleteEventVolunteerHoursAction(id), {
        success: "Hours entry deleted.",
        error: "Could not delete the hours entry. Please try again.",
        onSuccess: refreshAfterChange,
      });
    });
  }

  function handleDeleteShift(id: string) {
    startDeleteTransition(async () => {
      await runAction(() => deleteEventShiftAction(id), {
        success: "Shift deleted.",
        error: "Could not delete the shift. Please try again.",
        onSuccess: refreshAfterChange,
      });
    });
  }

  function handleShiftReassign(volunteerId: string, shiftId: string | null) {
    const shiftLabel = shifts.find((shift) => shift.id === shiftId)?.label;
    startDeleteTransition(async () => {
      await runAction(
        () => updateEventVolunteerShiftAction(volunteerId, shiftId),
        {
          success: shiftLabel
            ? `Volunteer moved to "${shiftLabel}".`
            : "Volunteer removed from their shift.",
          error: "Could not reassign the volunteer. Please try again.",
          onSuccess: refreshAfterChange,
        },
      );
    });
  }

  const shiftHeadcounts = new Map<string, number>();
  for (const volunteer of volunteers ?? []) {
    if (!volunteer.shift_id) continue;
    shiftHeadcounts.set(
      volunteer.shift_id,
      (shiftHeadcounts.get(volunteer.shift_id) ?? 0) + 1,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {tabData && (
        <VolunteersSummary
          volunteers={volunteers}
          shifts={shifts}
          hours={hours}
        />
      )}

      <ShiftsSection
        shifts={shifts}
        shiftHeadcounts={shiftHeadcounts}
        mode={mode}
        isDeleting={isDeleting}
        onUpdateShift={async (id, formData) => {
          const result = await updateEventShiftAction(id, formData);
          if (!("error" in result)) refreshAfterChange();
          return result;
        }}
        onDeleteShift={handleDeleteShift}
      />

      <RosterSection
        eventId={eventId}
        rows={buildRoster(volunteers, hours)}
        shifts={shifts}
        mode={mode}
        isDeleting={isDeleting}
        loading={tabData === undefined}
        onDeleteVolunteer={handleDeleteVolunteer}
        onDeleteHours={handleDeleteHours}
        onShiftReassign={handleShiftReassign}
        onSaved={refreshAfterChange}
      />
    </div>
  );
}
