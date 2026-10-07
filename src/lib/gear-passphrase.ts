import { applyLexicon, type Lexicon } from "@/lib/lexicon";

/**
 * The words around a tenant's gear passphrase (#1536), written once.
 *
 * Read by the dialog that asks for it and by the cart's server action, which
 * answers a refused submit with the same sentence the dialog opens with -- a
 * rotated passphrase should read as "enter it again", not as a new failure.
 *
 * Zero runtime imports beyond the lexicon, which is itself client-safe: the
 * dialog and the checkout form are client components.
 */

/** Session storage key for the passphrase this browser verified. */
export const GEAR_PASSPHRASE_STORAGE_KEY = "gear-passphrase";

export const GEAR_PASSPHRASE_TITLE = "Enter the passphrase";

/**
 * The dialog's opening line. `{organization}` is the tenant's name, and
 * "this organization" where there is none to read.
 */
export function gearPassphraseIntro(
  organization: string | null,
  lexicon: Lexicon,
): string {
  // The name is prepended, not templated: an organization's own name is not
  // a lexicon template and must not be substituted into.
  return `${organization?.trim() || "This organization"} ${applyLexicon(
    "shares a passphrase with the people it serves. Enter it to request {item_plural:lower}.",
    lexicon,
  )}`;
}

export const GEAR_PASSPHRASE_WRONG =
  "That passphrase doesn't match. Check it and try again.";

/** What a submit refused with PASSPHRASE_REQUIRED says, before the dialog reopens. */
export const GEAR_PASSPHRASE_EXPIRED =
  "Enter the passphrase to send your request. It may have changed since you last entered it.";

/**
 * The passphrase this browser verified (#1536), for the rest of the session.
 * Storage can be unavailable (private windows, blocked site data); the gate
 * then simply asks again, which is the safe direction.
 */
export function storedGearPassphrase(): string | null {
  try {
    return window.sessionStorage.getItem(GEAR_PASSPHRASE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeGearPassphrase(passphrase: string | null) {
  try {
    if (passphrase === null) {
      window.sessionStorage.removeItem(GEAR_PASSPHRASE_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(GEAR_PASSPHRASE_STORAGE_KEY, passphrase);
    }
  } catch {
    // See storedGearPassphrase().
  }
}

export function forgetGearPassphrase() {
  storeGearPassphrase(null);
}
