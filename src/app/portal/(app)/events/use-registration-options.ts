"use client";

import { useEffect, useState } from "react";
import type { RegistrationOptionsQuestion } from "@/lib/registration-options";
import { listEventRegistrationOptionsAction } from "./registrants-actions";

/**
 * The event's registration question (#1407) for the add-registrant and
 * walk-in dialogs, loaded when one opens. Null until it arrives and for an
 * event that asks none. Caps are shown in the label rather than enforced:
 * staff are not held to them.
 */
export function useRegistrationOptions(
  eventId: string,
  open: boolean,
): RegistrationOptionsQuestion | null {
  const [question, setQuestion] = useState<RegistrationOptionsQuestion | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listEventRegistrationOptionsAction(eventId).then((result) => {
      if (cancelled || "error" in result || !result.data) return;
      setQuestion({
        prompt: result.data.prompt,
        options: result.data.options.map((option) => ({
          id: option.id,
          label:
            option.cap === null
              ? option.label
              : `${option.label} (cap ${option.cap})`,
          isFull: false,
        })),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, open]);

  return question;
}
