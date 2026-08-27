"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createEventVolunteerAction,
  createEventVolunteerHoursAction,
  deleteEventVolunteerAction,
  deleteEventVolunteerHoursAction,
  listEventVolunteerHoursAction,
  listEventVolunteersAction,
  updateEventVolunteerShiftAction,
  type EventVolunteer,
  type EventVolunteerHours,
} from "./volunteers-actions";
import {
  createEventShiftAction,
  deleteEventShiftAction,
  listEventShiftsAction,
  type EventShift,
} from "./shifts-actions";
import { type PickedPerson } from "../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";
import { ShiftsSection } from "./volunteers/shifts";
import { SignupsSection } from "./volunteers/signups";
import { HoursSection } from "./volunteers/hours";

type VolunteersTabData = {
  volunteers: EventVolunteer[];
  hours: EventVolunteerHours[];
  shifts: EventShift[];
  people: PersonListItem[];
};

async function fetchVolunteersTabData(
  eventId: string,
): Promise<{ error: string } | { data: VolunteersTabData }> {
  const [volunteersResult, hoursResult, shiftsResult, peopleResult] =
    await Promise.all([
      listEventVolunteersAction(eventId),
      listEventVolunteerHoursAction(eventId),
      listEventShiftsAction(eventId),
      listPeopleAction(),
    ]);

  if ("error" in volunteersResult) {
    return { error: volunteersResult.error };
  }

  return {
    data: {
      volunteers: volunteersResult.data,
      hours: "error" in hoursResult ? [] : hoursResult.data,
      shifts: "error" in shiftsResult ? [] : shiftsResult.data,
      people: "error" in peopleResult ? [] : peopleResult.data,
    },
  };
}

export function VolunteersTab({
  eventId,
  active,
  mode,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
}) {
  const router = useRouter();
  const {
    data: tabData,
    loadError,
    refresh: refreshTabData,
  } = useTabData<VolunteersTabData>(
    () => fetchVolunteersTabData(eventId),
    active,
    [eventId],
  );
  const volunteers = tabData?.volunteers ?? [];
  const hours = tabData?.hours ?? [];
  const shifts = tabData?.shifts ?? [];
  const [newPeople, setNewPeople] = useState<PersonListItem[]>([]);
  const people = [...(tabData?.people ?? []), ...newPeople];
  const [showAddVolunteer, setShowAddVolunteer] = useState(false);
  const [showAddHours, setShowAddHours] = useState(false);
  const [showAddShift, setShowAddShift] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  useResetOnModeChange(mode, () => {
    setShowAddVolunteer(false);
    setShowAddHours(false);
    setShowAddShift(false);
  });

  function refresh() {
    refreshTabData();
    router.refresh();
  }

  function handlePersonCreated(person: PickedPerson) {
    setNewPeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function handleDeleteVolunteer(id: string) {
    startDeleteTransition(async () => {
      await deleteEventVolunteerAction(id);
      refresh();
    });
  }

  function handleDeleteHours(id: string) {
    startDeleteTransition(async () => {
      await deleteEventVolunteerHoursAction(id);
      refresh();
    });
  }

  function handleDeleteShift(id: string) {
    startDeleteTransition(async () => {
      await deleteEventShiftAction(id);
      refresh();
    });
  }

  function handleShiftReassign(volunteerId: string, shiftId: string | null) {
    startDeleteTransition(async () => {
      await updateEventVolunteerShiftAction(volunteerId, shiftId);
      refresh();
    });
  }

  const totalHours = (hours ?? []).reduce(
    (sum, entry) => sum + Number(entry.hours),
    0,
  );
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

      <ShiftsSection
        shifts={shifts}
        shiftHeadcounts={shiftHeadcounts}
        mode={mode}
        isDeleting={isDeleting}
        showAddShift={showAddShift}
        onToggleAddShift={(show) => {
          setShowAddShift(show);
          if (!show) refresh();
        }}
        onCreateShift={(formData) => createEventShiftAction(eventId, formData)}
        onDeleteShift={handleDeleteShift}
      />

      <SignupsSection
        volunteers={volunteers}
        shifts={shifts}
        people={people}
        mode={mode}
        isDeleting={isDeleting}
        loading={tabData === undefined}
        showAddVolunteer={showAddVolunteer}
        onToggleAddVolunteer={(show) => {
          setShowAddVolunteer(show);
          if (!show) refresh();
        }}
        onPersonCreated={handlePersonCreated}
        onCreateVolunteer={(personId, formData) =>
          createEventVolunteerAction(eventId, personId, formData)
        }
        onDeleteVolunteer={handleDeleteVolunteer}
        onShiftReassign={handleShiftReassign}
      />

      <HoursSection
        hours={hours}
        people={people}
        mode={mode}
        isDeleting={isDeleting}
        loading={tabData === undefined}
        totalHours={totalHours}
        showAddHours={showAddHours}
        onToggleAddHours={(show) => {
          setShowAddHours(show);
          if (!show) refresh();
        }}
        onPersonCreated={handlePersonCreated}
        onCreateHours={(personId, formData) =>
          createEventVolunteerHoursAction(eventId, personId, formData)
        }
        onDeleteHours={handleDeleteHours}
      />
    </div>
  );
}
