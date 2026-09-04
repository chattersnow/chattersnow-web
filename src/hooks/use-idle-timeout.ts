"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVITY_WRITE_INTERVAL_MS,
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  LAST_ACTIVITY_KEY,
  idlePhaseAt,
  msUntilNextIdleTransition,
  parseActivityStamp,
  readLastActivity,
  writeLastActivity,
} from "@/lib/auth/idle-timeout";

/**
 * Events that count as "someone is still here". Capture phase, because the
 * warning dialog is portalled and its primitives stop propagation on some of
 * these -- without capture, typing inside the dialog wouldn't register as
 * activity.
 *
 * `visibilitychange` and `focus` are deliberately NOT in this list. They mean
 * "this tab is being looked at again", which is not the same as being used: if
 * they reset the clock, alt-tabbing back after two hours would silently renew
 * the session, which is precisely the case this ticket exists to close. They
 * trigger a re-check instead (see below), which is what makes the
 * wake-from-sleep path expire immediately.
 */
const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "scroll",
  "touchstart",
] as const;

/** Floor on the next wake, so clock jitter can't spin the scheduler. */
const MIN_SCHEDULE_MS = 250;

export type UseIdleTimeoutOptions = {
  /** Called once, when the session has been idle past the timeout. */
  onExpire: () => void;
  idleMs?: number;
  warningMs?: number;
  enabled?: boolean;
};

export type IdleTimeoutState = {
  /** Whether the "Still there?" warning should be on screen. */
  warning: boolean;
  /** Milliseconds left before sign-out; 0 outside the warning window. */
  msRemaining: number;
  /** Treat the user as active right now, closing the warning. */
  extend: () => void;
};

/**
 * Signs a session out after a period of inactivity, warning first.
 *
 * The whole machine is one `setTimeout` that reschedules itself. Nothing about
 * the phase is stored: each wake re-derives it from `Date.now()` against the
 * last-activity stamp, so a timer that fired late or never (background-tab
 * clamping, a sleeping laptop) can't extend the session past its deadline.
 */
export function useIdleTimeout({
  onExpire,
  idleMs = IDLE_TIMEOUT_MS,
  warningMs = IDLE_WARNING_MS,
  enabled = true,
}: UseIdleTimeoutOptions): IdleTimeoutState {
  const [warningUntil, setWarningUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  // Held in a ref so a parent re-render doesn't tear down the listeners and
  // the timer just to pick up a new closure.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const extendRef = useRef<() => void>(() => {});
  const extend = useCallback(() => extendRef.current(), []);

  useEffect(() => {
    if (!enabled) return;

    const durations = { idleMs, warningMs };
    let timer: ReturnType<typeof setTimeout> | undefined;
    // One-shot: the scheduler, a cross-tab signal and a click can all land in
    // the same tick, and expiry must only ever happen once.
    let expired = false;

    // Adopt whatever the other tabs already know, so a new tab doesn't hand
    // someone a fresh 30 minutes just by being opened.
    let lastActivity = readLastActivity() ?? Date.now();
    let lastWrite = lastActivity;
    writeLastActivity(lastActivity);

    function schedule() {
      clearTimeout(timer);
      if (expired) return;

      const at = Date.now();
      const phase = idlePhaseAt(lastActivity, at, durations);

      if (phase === "expired") {
        expired = true;
        setWarningUntil(null);
        onExpireRef.current();
        return;
      }

      setWarningUntil(phase === "warning" ? lastActivity + idleMs : null);
      // Seeds the countdown at the moment the warning opens, so the dialog's
      // first paint shows the real remaining time rather than waiting a second
      // for the interval below to produce one.
      setNow(at);
      timer = setTimeout(
        schedule,
        Math.max(
          msUntilNextIdleTransition(lastActivity, at, durations),
          MIN_SCHEDULE_MS,
        ),
      );
    }

    function markActivity(force = false) {
      if (expired) return;
      const at = Date.now();
      // The throttle is the whole cost story: during a pointermove storm this
      // is two clock reads and a compare, with no storage traffic and no timer
      // churn.
      //
      // It needs no exception for the warning dialog, tempting as one looks:
      // reaching the warning at all means nothing has been written for the
      // whole idle period, which is orders of magnitude past this window, so
      // the first movement that dismisses the dialog always writes through.
      if (!force && at - lastWrite < ACTIVITY_WRITE_INTERVAL_MS) return;
      lastWrite = at;
      lastActivity = at;
      writeLastActivity(at);
      schedule();
    }

    function handleActivity() {
      markActivity();
    }

    /**
     * A tab coming back to the foreground, or a machine waking up. Not
     * activity -- just the earliest chance to notice how much time really
     * passed, before the stale timer gets around to firing.
     */
    function recheck() {
      const stored = readLastActivity();
      if (stored !== null && stored > lastActivity) {
        lastActivity = stored;
        lastWrite = stored;
      }
      schedule();
    }

    /** Activity in another tab keeps this one alive. */
    function handleStorage(event: StorageEvent) {
      if (event.key !== LAST_ACTIVITY_KEY) return;
      const stamp = parseActivityStamp(event.newValue);
      // A cleared or corrupt value must never be read as an ancient stamp, and
      // a laggy tab must never be able to shorten anyone else's session.
      if (stamp === null || stamp <= lastActivity) return;
      lastActivity = stamp;
      lastWrite = stamp;
      schedule();
    }

    extendRef.current = () => markActivity(true);

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, {
        passive: true,
        capture: true,
      });
    }
    window.addEventListener("focus", recheck);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", recheck);

    schedule();

    return () => {
      clearTimeout(timer);
      extendRef.current = () => {};
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity, { capture: true });
      }
      window.removeEventListener("focus", recheck);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [enabled, idleMs, warningMs]);

  // Ticks only while the warning is up, and only to re-render the countdown --
  // it never decides expiry, which stays with the scheduler above. A throttled
  // background tab may therefore show a stuck countdown while still signing
  // out exactly on time, which is the right way round.
  useEffect(() => {
    if (warningUntil === null) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [warningUntil]);

  return {
    warning: warningUntil !== null,
    msRemaining: warningUntil === null ? 0 : Math.max(0, warningUntil - now),
    extend,
  };
}
