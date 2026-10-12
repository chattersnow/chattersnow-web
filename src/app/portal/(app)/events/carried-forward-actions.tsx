"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  listCarriedForwardActionsAction,
  setEventRetroActionDoneAction,
} from "./retro-actions";
import { canChangeRetroItem, RetroActionRow } from "./retro-section";
import { useTabData } from "@/hooks/use-tab-data";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { runAction } from "@/components/portal/action-toast";

/**
 * Open action items from earlier events in the same program (#1578), on the
 * Checklist card, so a lesson reaches the next event's to-do list instead of
 * staying in the last one's report. Renders nothing when there are none.
 */
export function CarriedForwardActions({ eventId }: { eventId: string }) {
  const router = useRouter();
  const { data, loadError, refresh } = useTabData(
    () => listCarriedForwardActionsAction(eventId),
    [eventId],
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (!data || data.items.length === 0) return null;

  function handleToggle(id: string, done: boolean) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      await runAction(() => setEventRetroActionDoneAction(id, done), {
        success: done ? "Action item done." : "Action item reopened.",
        onError: setError,
        onSuccess: () => {
          refresh();
          router.refresh();
        },
      });
      setPendingId(null);
    });
  }

  return (
    <section
      aria-labelledby="carried-forward-heading"
      className="flex flex-col gap-1"
    >
      <h4 id="carried-forward-heading" className="app-eyebrow">
        Carried forward ({data.items.length})
      </h4>
      <p className="app-muted text-xs">
        Open action items from earlier events in this program.
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <ul className="flex flex-col divide-y divide-[var(--line)]">
        {data.items.map((item) => (
          <li key={item.id} className="py-2">
            <RetroActionRow
              item={item}
              canToggle={canChangeRetroItem(item, data)}
              pending={pendingId === item.id}
              onToggle={(done) => handleToggle(item.id, done)}
            >
              <Link
                href={`/portal/events/${item.event.id}?tab=results`}
                className="text-xs underline underline-offset-2"
              >
                From {item.event.name}
              </Link>
            </RetroActionRow>
          </li>
        ))}
      </ul>
    </section>
  );
}
