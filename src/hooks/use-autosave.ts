"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readActionError,
  type ActionResult,
} from "@/components/portal/action-toast";

/**
 * Saves an edit surface without a Save button (#1200).
 *
 * Written for the one place in the portal where losing a form is not an
 * inconvenience but the loss of the meeting record: a notetaker who looks
 * something up mid-meeting used to come back to an empty agenda form. Every
 * clause below exists because of a specific way an autosave loses data.
 *
 * **Not a transition.** `startTransition` marks the subtree pending, which
 * degrades typing in exactly the textareas this exists to protect. Plain async
 * plus a status state.
 *
 * **A queue of one.** At most one request is in flight; edits made during it
 * replace the queued value and fire the moment it settles. That stops
 * keystrokes being dropped during a slow save, and it stops out-of-order
 * Server Action responses resurrecting stale text -- Next makes no ordering
 * guarantee between concurrently dispatched actions, so two overlapping saves
 * of the same field is a race with a wrong answer in it.
 *
 * **A failure keeps the value.** The pending value is held, `dirty` stays
 * true, and the save is retried with backoff and again on the next edit. The
 * text on screen is the only copy, so the one thing this must never do is
 * forget it.
 *
 * **No toast.** `runAction` announces an outcome once, which is right for a
 * button; firing it on every pause in typing is noise. Callers render
 * `status` on a quiet inline line (`SaveStatusLine`) instead.
 *
 * The timer machinery is modelled on `use-idle-timeout.ts`: one
 * self-rescheduling `setTimeout` and a set of closures published to refs, so a
 * parent re-render never tears the engine down and nothing sets state from an
 * effect body.
 */

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Default quiet period after the last keystroke. */
const DEFAULT_DELAY_MS = 1500;

/** Backoff for a failed save: 2s, 4s, 8s, 16s, then every 30s. */
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;

const THROWN_ERROR = "Couldn't save. Check your connection.";

function retryDelayMs(attempt: number, baseMs: number): number {
  return Math.min(baseMs * 2 ** (attempt - 1), RETRY_MAX_MS);
}

export type UseAutosaveOptions<T> = {
  /**
   * Sends one value. Returns the action's own result, success or failure
   * envelope; the failure's message is what the status line shows.
   *
   * Read through a ref, so it may close over fresh state and does not need to
   * be stable.
   */
  save: (value: T) => Promise<ActionResult>;
  /** Quiet period after the last edit before a save fires. */
  delayMs?: number;
  /**
   * First backoff step after a failed save; it doubles from there, capped at
   * 30s. An option for the same reason `useIdleTimeout`'s durations are: the
   * tests dial it down rather than fake the global timers, which took
   * unrelated suites out with it once (see `use-idle-timeout.dom.test.tsx`).
   */
  retryBaseMs?: number;
  /**
   * False once the record can no longer be written to -- finalized minutes, a
   * viewer without manage access. Flipping this tears the engine down, so
   * anything queued is flushed on the way out.
   */
  enabled?: boolean;
};

export type Autosave<T> = {
  status: SaveStatus;
  /** From the first keystroke until that value has been accepted. */
  dirty: boolean;
  /** `Date.now()` of the last accepted save, for the status line. */
  lastSavedAt: number | null;
  errorMessage: string | null;
  /** Records an edit. Replaces any value still waiting to be sent. */
  queue: (value: T) => void;
  /**
   * Saves now, resolving once the queue has drained -- true when everything
   * queued was accepted, false when the last attempt failed.
   *
   * Resolving to a boolean rather than `void` is deliberate: a caller that
   * awaits this is about to decide whether it is safe to navigate away, and
   * reading `status` after the await would read the value captured by the
   * render that created the closure, not the one the save just produced.
   */
  flush: () => Promise<boolean>;
};

export function useAutosave<T>({
  save,
  delayMs = DEFAULT_DELAY_MS,
  retryBaseMs = RETRY_BASE_MS,
  enabled = true,
}: UseAutosaveOptions<T>): Autosave<T> {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Held in a ref so a re-render of the editor -- one per keystroke -- doesn't
  // tear down the engine just to pick up a new closure.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const queueRef = useRef<(value: T) => void>(() => {});
  const flushRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));
  const queue = useCallback((value: T) => queueRef.current(value), []);
  const flush = useCallback(() => flushRef.current(), []);

  useEffect(() => {
    if (!enabled) return;

    // `alive` gates state updates, not requests: the cleanup below deliberately
    // starts one last save on the way out, and only React must be left alone
    // after that.
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    /** The queue of one: the newest value nobody has sent yet. */
    let pending: { value: T } | null = null;
    let inFlight = false;
    let attempt = 0;
    let waiting: Array<(saved: boolean) => void> = [];

    function settle(saved: boolean) {
      const resolvers = waiting;
      waiting = [];
      for (const resolve of resolvers) resolve(saved);
    }

    function syncDirty() {
      if (alive) setDirty(pending !== null || inFlight);
    }

    async function send(value: T) {
      inFlight = true;
      if (alive) setStatus("saving");

      let failure: string | null;
      try {
        failure = readActionError(await saveRef.current(value));
      } catch {
        // A rejected Server Action -- offline, or the deployment moved under
        // the open page. Nothing readable came back, so say what the operator
        // can act on.
        failure = THROWN_ERROR;
      }
      inFlight = false;

      if (failure !== null) {
        // Put the value back, so the retry carries it -- unless typing has
        // already replaced it with something newer, which carries it anyway.
        if (pending === null) pending = { value };
        syncDirty();
        if (alive) {
          setStatus("error");
          setErrorMessage(failure);
          attempt += 1;
          clearTimeout(retry);
          retry = setTimeout(fire, retryDelayMs(attempt, retryBaseMs));
        }
        settle(false);
        return;
      }

      attempt = 0;
      if (alive) setErrorMessage(null);

      // Edits made while that request was open go out now rather than waiting
      // out another quiet period -- and `flush()` stays unresolved until they
      // land, because they are exactly what a caller flushing is waiting for.
      if (pending !== null) {
        const next = pending.value;
        pending = null;
        void send(next);
        return;
      }

      syncDirty();
      if (alive) {
        setStatus("saved");
        setLastSavedAt(Date.now());
      }
      settle(true);
    }

    function fire() {
      clearTimeout(timer);
      clearTimeout(retry);
      // Nothing to send, or something already going: either way the chain in
      // `send` picks the queue up when it settles.
      if (inFlight || pending === null) return;
      const next = pending.value;
      pending = null;
      void send(next);
    }

    /**
     * Switching away from the tab, or locking the phone. The one flush point
     * browsers are reliable about.
     */
    function flushOnHidden() {
      if (document.visibilityState === "hidden") fire();
    }

    /**
     * Best-effort only. A Server Action is a POST through `fetch`, and
     * `navigator.sendBeacon` cannot invoke one, so a browser that tears the
     * document down immediately may drop this. It costs nothing to try; the
     * flush that actually carries this feature is the cleanup below, because
     * Base UI unmounts the panel of the tab you switch away from.
     */
    function flushOnPageHide() {
      fire();
    }

    queueRef.current = (value: T) => {
      pending = { value };
      syncDirty();
      // A fresh edit supersedes a backoff wait: the next attempt goes out after
      // the ordinary quiet period instead of at the end of a 30-second window.
      clearTimeout(retry);
      if (inFlight) return;
      clearTimeout(timer);
      timer = setTimeout(fire, delayMs);
    };

    flushRef.current = () => {
      if (pending === null && !inFlight) return Promise.resolve(true);
      const settled = new Promise<boolean>((resolve) => {
        waiting.push(resolve);
      });
      fire();
      return settled;
    };

    document.addEventListener("visibilitychange", flushOnHidden);
    window.addEventListener("pagehide", flushOnPageHide);

    return () => {
      alive = false;
      clearTimeout(timer);
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", flushOnHidden);
      window.removeEventListener("pagehide", flushOnPageHide);
      queueRef.current = () => {};
      flushRef.current = () => Promise.resolve(true);
      // The unmount flush. Its result can no longer be reported, so anyone
      // still awaiting a flush is told the save was not confirmed.
      fire();
      settle(false);
    };
  }, [enabled, delayMs, retryBaseMs]);

  return { status, dirty, lastSavedAt, errorMessage, queue, flush };
}
