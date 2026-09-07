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
import { GiveawaySection } from "./giveaway/section";
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
            config={tierConfig ?? null}
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

          {giveaway && tierConfig && (
            <>
              <GiveawaySection
                title="Ticket tiers"
                description="A donated item or a bought package earns the row's bundle. Every donated item earns its own bundle. Keywords preselect a tier at donation intake."
                summary={
                  tierConfig.tiers.length
                    ? `${count(tierConfig.tiers.length, "tier")} · ${count(tierConfig.rules.length, "keyword")}`
                    : "Not set up"
                }
                defaultOpen={!tierConfig.tiers.length}
              >
                <TiersSection
                  giveawayId={giveaway.id}
                  config={tierConfig}
                  canEdit={canEdit}
                  onChanged={refresh}
                />
              </GiveawaySection>

              <GiveawaySection
                title="Ticket packages"
                description="Price points participants can buy into. Each grants its tier's bundle. Payment is taken outside the portal."
                summary={
                  tierConfig.packages.length
                    ? count(tierConfig.packages.length, "package")
                    : "None yet"
                }
              >
                <PackagesSection
                  giveawayId={giveaway.id}
                  config={tierConfig}
                  canEdit={canEdit}
                  onChanged={refresh}
                />
              </GiveawaySection>

              <GiveawaySection
                title="Draw buckets"
                description="Participants choose which bucket to drop each ticket into. One pull per prize."
                summary={
                  tierConfig.buckets.length
                    ? count(tierConfig.buckets.length, "bucket")
                    : "None yet"
                }
                defaultOpen={
                  !!tierConfig.tiers.length && !tierConfig.buckets.length
                }
              >
                <BucketsSection
                  giveawayId={giveaway.id}
                  config={tierConfig}
                  prizes={giveaway.giveaway_prizes}
                  canEdit={canEdit}
                  onChanged={refresh}
                />
              </GiveawaySection>
            </>
          )}

          <p className="app-muted text-xs">
            This tab only records giveaway results. Public-facing ticket sales
            require a legal, tax, and jurisdictional review before being
            enabled.
          </p>
        </>
      )}
    </div>
  );
}

/** "1 tier" / "3 tiers", for the one-line state on a collapsed setup block. */
function count(total: number, noun: string) {
  return total === 1 ? `1 ${noun}` : `${total} ${noun}s`;
}
