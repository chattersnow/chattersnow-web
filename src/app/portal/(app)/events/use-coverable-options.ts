"use client";

import { useEffect, useState } from "react";
import { listEventRegistrationOptionsAction } from "./registrants-actions";

/** A registration option a discount code can cover (#1589). */
export type CoverableOption = {
  id: string;
  label: string;
  price: number | null;
};

/**
 * The event's registration options with their prices, for the discount code
 * dialogs, loaded when one opens. Empty until they arrive and for an event
 * that asks no registration question.
 */
export function useCoverableOptions(
  eventId: string,
  open: boolean,
): CoverableOption[] {
  const [options, setOptions] = useState<CoverableOption[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listEventRegistrationOptionsAction(eventId).then((result) => {
      if (cancelled || "error" in result || !result.data) return;
      setOptions(
        result.data.options.map(({ id, label, price }) => ({
          id,
          label,
          price,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, open]);

  return options;
}
