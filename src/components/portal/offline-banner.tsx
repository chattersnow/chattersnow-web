"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "@/components/ui/toast";

/**
 * Says the connection is gone, and refuses to let a form pretend otherwise
 * (#1083).
 *
 * The jobs this portal is installed for happen standing in a venue, on wifi
 * that may or may not hold -- so the failure mode that matters is not a broken
 * page, it is a donation typed into a form that quietly went nowhere. There is
 * no write queue yet (that needs an idempotency story first, or a replayed
 * donation becomes a data-integrity bug), so offline is **honest failure**: a
 * banner that stays up for as long as the connection is down, and a submit
 * that is refused out loud rather than swallowed.
 *
 * The refusal is one capture-phase listener on `document` rather than a
 * `disabled` prop threaded through every form in the portal. Every portal
 * write starts as a `submit` on a `<form>` -- Server Action forms included,
 * since React dispatches those from the same event -- so one listener above
 * React's own root covers all of them, and no new form can be added that
 * forgets to opt in.
 */
export function OfflineBanner() {
  // False on the server and on first paint, corrected by the effect below.
  // `navigator.onLine` cannot be read during render, and guessing "offline"
  // would flash a banner at every visitor who is perfectly well connected.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();

    // Read at event time rather than from state: this listener outlives any
    // one render, and a stale closure here would block submits after the
    // connection came back.
    const refuse = (event: Event) => {
      if (navigator.onLine) return;
      event.preventDefault();
      event.stopPropagation();
      toast.error("No connection.", {
        description:
          "Nothing was sent. Reconnect and try again -- what you typed is still here.",
      });
    };

    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    document.addEventListener("submit", refuse, true);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("submit", refuse, true);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-[var(--line)] bg-[var(--purple-soft)] px-6 py-2.5 text-sm text-[var(--purple-deep)] sm:px-10"
    >
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">You are offline.</span> You can keep
        reading what is already on screen, but nothing can be saved until the
        connection is back.
      </p>
    </div>
  );
}
