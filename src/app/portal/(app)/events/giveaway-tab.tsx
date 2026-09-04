"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteGiveawayPrizeAction,
  getEventGiveawayAction,
  type Giveaway,
} from "./giveaway-actions";
import type { PersonListItem } from "../people/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";
import { SalesSection } from "./giveaway/sales";
import { PrizesSection } from "./giveaway/prizes";
import { TiersSection } from "./giveaway/tiers";
import { BucketsSection } from "./giveaway/buckets";
import { PackagesSection } from "./giveaway/packages";
import { TicketPoolSummary } from "./giveaway/ticket-pool";
import {
  getGiveawayTierConfigAction,
  type GiveawayTierConfig,
} from "./giveaway-tier-actions";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { runAction } from "@/components/portal/action-toast";

export function GiveawayTab({
  eventId,
  people,
  onPersonCreated,
  mode,
  onExitEdit,
}: {
  eventId: string;
  people: PersonListItem[];
  onPersonCreated: (person: PersonListItem) => void;
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
    [eventId],
  );
  // Tier setup only exists once a giveaway row does, so this is keyed off the
  // giveaway id rather than the event id.
  const giveawayId = giveaway?.id ?? null;
  const { data: tierConfig, refresh: refreshTierConfig } =
    useTabData<GiveawayTierConfig | null>(
      () =>
        giveawayId
          ? getGiveawayTierConfigAction(giveawayId)
          : Promise.resolve({ data: null }),
      [giveawayId],
      !!giveawayId,
    );
  const [isDeleting, startDeleteTransition] = useTransition();
  const [editingWinnerId, setEditingWinnerId] = useState<string | null>(null);
  const [editingPrizeId, setEditingPrizeId] = useState<string | null>(null);
  const [showAddPrize, setShowAddPrize] = useState(false);
  const canEdit = mode === "edit";

  useResetOnModeChange(mode, () => {
    setEditingWinnerId(null);
    setEditingPrizeId(null);
    setShowAddPrize(false);
  });

  function refresh() {
    refreshGiveaway();
    refreshTierConfig();
    router.refresh();
  }

  function handleDeletePrize(id: string) {
    startDeleteTransition(async () => {
      await runAction(() => deleteGiveawayPrizeAction(id), {
        success: "Prize deleted.",
        error: "Could not delete the prize. Please try again.",
        onSuccess: refresh,
      });
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
        <TabLoadingSkeleton />
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

          {giveaway && tierConfig && (
            <>
              <TicketPoolSummary config={tierConfig} />
              <TiersSection
                giveawayId={giveaway.id}
                config={tierConfig}
                canEdit={canEdit}
                onChanged={refresh}
              />
              <PackagesSection
                giveawayId={giveaway.id}
                config={tierConfig}
                canEdit={canEdit}
                onChanged={refresh}
              />
              <BucketsSection
                giveawayId={giveaway.id}
                config={tierConfig}
                prizes={giveaway.giveaway_prizes}
                canEdit={canEdit}
                onChanged={refresh}
              />
            </>
          )}

          {giveaway && (
            <PrizesSection
              giveaway={giveaway}
              people={people}
              canEdit={canEdit}
              buckets={tierConfig?.buckets ?? []}
              onBucketAssigned={refresh}
              isDeleting={isDeleting}
              editingWinnerId={editingWinnerId}
              editingPrizeId={editingPrizeId}
              showAddPrize={showAddPrize}
              onPersonCreated={onPersonCreated}
              onDeletePrize={handleDeletePrize}
              onEditPrize={(prizeId) => setEditingPrizeId(prizeId)}
              onPrizeSaved={() => {
                setEditingPrizeId(null);
                refresh();
              }}
              onCancelPrizeEdit={() => setEditingPrizeId(null)}
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
