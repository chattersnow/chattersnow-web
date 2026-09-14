"use client";

import { useCallback, useTransition } from "react";
import { toast } from "@/components/ui/toast";

/**
 * What a portal Server Action settles into: a failure carries a message, a
 * success carries whatever the caller needs (usually just `{ success: true }`,
 * sometimes an id or a count).
 *
 * Two failure shapes, on purpose. `{ error: string }` is what most actions
 * still answer; `{ error: { code, message } }` is the envelope the write paths
 * split from their transport now answer (#1082 Phase 2). Both are read here so
 * the two can coexist while the rest are converted -- a helper that understood
 * only one of them would turn the other's copy into the generic fallback.
 */
export type ActionResult =
  { error: string } | { error: { message: string } } | object | void;

/** The success half of an action's result union, once `{ error }` is ruled out. */
type Succeeded<T> = Exclude<T, { error: unknown }>;

export type RunActionOptions<T> = {
  /**
   * The receipt. Name the record rather than saying "Saved" -- and where the
   * write covers several rows, say how many ("14 items assigned").
   */
  success: string | ((result: Succeeded<T>) => string);
  description?: string | ((result: Succeeded<T>) => string | undefined);
  /** Shown only when the action throws or fails without a message of its own. */
  error?: string;
  /**
   * Surfaces that already render the failure inline (a dialog's Alert, a
   * settings panel's status line) pass this to claim the error branch, so the
   * operator isn't told the same thing twice.
   */
  onError?: (message: string) => void;
  /** Runs after a success is announced -- close the sheet, refresh the route. */
  onSuccess?: (result: Succeeded<T>) => void;
};

export type RunActionOutcome<T> =
  { ok: true; data: Succeeded<T> } | { ok: false; message: string };

const FALLBACK_ERROR = "Something went wrong. Please try again.";

function errorMessage(result: unknown): string | null {
  if (result && typeof result === "object" && "error" in result) {
    const { error } = result as { error?: unknown };
    if (typeof error === "string" && error.length > 0) return error;
    // The #1082 envelope: `{ error: { code, message } }`, where `message` is
    // the display copy the plain-string shape used to carry directly.
    if (error && typeof error === "object" && "message" in error) {
      const { message } = error as { message?: unknown };
      if (typeof message === "string" && message.length > 0) return message;
    }
    if (error) return FALLBACK_ERROR;
  }
  return null;
}

function resolve<T, R>(
  value: R | ((result: T) => R) | undefined,
  result: T,
): R | undefined {
  return typeof value === "function"
    ? (value as (result: T) => R)(result)
    : value;
}

/**
 * Calls a Server Action and announces the outcome exactly once, so a save the
 * page shows no evidence of still leaves a receipt. Returns the outcome for
 * callers that need to branch (reset a form, keep a sheet open).
 */
export async function runAction<T extends ActionResult>(
  action: () => Promise<T>,
  options: RunActionOptions<T>,
): Promise<RunActionOutcome<T>> {
  const fail = (message: string): RunActionOutcome<T> => {
    if (options.onError) options.onError(message);
    else toast.error(message);
    return { ok: false, message };
  };

  let result: T;
  try {
    result = await action();
  } catch {
    return fail(options.error ?? FALLBACK_ERROR);
  }

  const message = errorMessage(result);
  if (message)
    return fail(
      message === FALLBACK_ERROR ? (options.error ?? message) : message,
    );

  const succeeded = result as Succeeded<T>;
  toast.success(resolve(options.success, succeeded) as string, {
    description: resolve(options.description, succeeded),
  });
  options.onSuccess?.(succeeded);
  return { ok: true, data: succeeded };
}

/**
 * `runAction` with a transition of its own, for the common case where the
 * caller only needs a pending flag.
 */
export function useActionToast() {
  const [isPending, startTransition] = useTransition();

  const run = useCallback(
    <T extends ActionResult>(
      action: () => Promise<T>,
      options: RunActionOptions<T>,
    ) => {
      startTransition(async () => {
        await runAction(action, options);
      });
    },
    [],
  );

  return { isPending, run };
}
