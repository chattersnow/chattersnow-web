"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteGiveawayPrizeAction,
  getEventGiveawayAction,
  type Giveaway,
} from "./giveaway-actions";
import { type PickedPerson } from "../people/person-picker";
import { listPeopleAction, type PersonListItem } from "../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";
import { SalesSection } from "./giveaway/sales";
import { PrizesSection } from "./giveaway/prizes";

export function GiveawayTab({
  eventId,
  active,
  mode,
  onExitEdit,
}: {
  eventId: string;
  active: boolean;
  mode: "view" | "edit";
  onExitEdit: () => void;
}) {
  const router = useRouter();
  const {
    data: giveaway,
    loadError,
    refresh: refreshGiveaway,
  } = useTabData<Giveaway | null>(
    () => getEventGiveawayAction(eventId),
    active,
    [eventId],
  );
  const { data: peopleData, refresh: refreshPeople } = useTabData<
    PersonListItem[]
  >(() => listPeopleAction(), active, [eventId]);
  const [newPeople, setNewPeople] = useState<PersonListItem[]>([]);
  const people = [...(peopleData ?? []), ...newPeople];
  const [isDeleting, startDeleteTransition] = useTransition();
  const [editingWinnerId, setEditingWinnerId] = useState<string | null>(null);
  const [showAddPrize, setShowAddPrize] = useState(false);
  const canEdit = mode === "edit";

  useResetOnModeChange(mode, () => {
    setEditingWinnerId(null);
    setShowAddPrize(false);
  });

  function refresh() {
    refreshGiveaway();
    refreshPeople();
    router.refresh();
  }

  function handlePersonCreated(person: PickedPerson) {
    setNewPeople((prev) => [...prev, { ...person, is_sponsor: false }]);
  }

  function handleDeletePrize(id: string) {
    startDeleteTransition(async () => {
      await deleteGiveawayPrizeAction(id);
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="app-muted text-xs">
        This tab only records giveaway results. Public-facing ticket sales
        require a legal, tax, and jurisdictional review before being enabled.
      </p>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {giveaway === undefined ? (
        <p className="app-muted text-sm">Loading giveaway...</p>
      ) : (
        <>
          <SalesSection
            eventId={eventId}
            giveaway={giveaway}
            canEdit={canEdit}
            onSaved={() => {
              refresh();
              onExitEdit();
            }}
            onCancel={onExitEdit}
          />

          {giveaway && (
            <PrizesSection
              giveaway={giveaway}
              people={people}
              canEdit={canEdit}
              isDeleting={isDeleting}
              editingWinnerId={editingWinnerId}
              showAddPrize={showAddPrize}
              onPersonCreated={handlePersonCreated}
              onDeletePrize={handleDeletePrize}
              onEditWinner={(prizeId) => setEditingWinnerId(prizeId)}
              onWinnerSaved={() => {
                setEditingWinnerId(null);
                refresh();
              }}
              onCancelWinnerEdit={() => setEditingWinnerId(null)}
              onToggleAddPrize={(show) => setShowAddPrize(show)}
              onPrizeAdded={() => {
                setShowAddPrize(false);
                refresh();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
