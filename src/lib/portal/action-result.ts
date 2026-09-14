// One result shape for the portal write paths that have been split from their
// transport (#1082 Phase 2).
//
// Deliberately the same shape as the public API's envelope
// (`src/lib/api/errors.ts`, #813 Phase 3): `{ error: { code, message, fields? } }`,
// where `code` is the contract and is what a consumer branches on.
//
// One difference, and it is the reason this is a separate module rather than a
// reuse of ApiError. The public API's `message` is a sentence for a developer
// reading a log; a consumer renders its own words from the code. Here the
// message *is* the portal's display copy -- the same string the modals showed
// before this change -- because the web app is a consumer too, and the copy it
// shows was already written for the person at the intake table. A second
// consumer is free to ignore the message and render its own words from the
// code; the web app keeps rendering the message.
import type { ParseResult } from "@/lib/forms";

export type ActionErrorCode =
  /** No session. The caller should sign in and retry. */
  | "unauthenticated"
  /** Signed in, but the role does not carry the permission the write needs. */
  | "forbidden"
  /** The input did not pass the shared parser. `fields` names what, if known. */
  | "invalid_input"
  /** The write conflicts with the state of the thing (already given out). */
  | "conflict"
  /** Something broke on our side: a failed RPC, a constraint, a lost grant. */
  | "server_error";

export type ActionError = {
  code: ActionErrorCode;
  /** Display copy. The web app renders this verbatim. */
  message: string;
  /** Per-field messages, where the parser named a field. */
  fields?: Record<string, string>;
};

export type ActionFailure = { error: ActionError };

export function actionError(
  code: ActionErrorCode,
  message: string,
  fields?: Record<string, string>,
): ActionFailure {
  return { error: { code, message, ...(fields ? { fields } : {}) } };
}

/**
 * `checkUser` and `checkAnyPermission` still answer `{ error: string }`: they
 * are shared with ~85 actions that have not been split from their transport,
 * and changing them would be a change to all of those rather than to these
 * three. So the cores translate at the boundary instead.
 *
 * The two are distinguishable by which helper produced them, not by reading
 * the string, which is why this takes the code rather than guessing it.
 */
export function fromGuard(
  code: Extract<ActionErrorCode, "unauthenticated" | "forbidden">,
  guard: { error: string },
): ActionFailure {
  return actionError(code, guard.error);
}

/**
 * A parser refusal becomes `invalid_input`. `ParseResult` carries an optional
 * `field`, so a refusal that named one arrives as a field error as well as a
 * message; one that did not is still a message, which is what the form showed
 * before.
 */
export function fromParseError(
  parsed: Extract<ParseResult<unknown>, { error: string }>,
): ActionFailure {
  return actionError(
    "invalid_input",
    parsed.error,
    parsed.field ? { [parsed.field]: parsed.error } : undefined,
  );
}
