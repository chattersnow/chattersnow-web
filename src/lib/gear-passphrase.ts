import { applyLexicon, type Lexicon } from "@/lib/lexicon";

/**
 * The words around a tenant's gear passphrase (#1536), written once.
 *
 * Read by the dialog that asks for it and by the cart's server action, which
 * answers a refused submit with the same sentence the dialog opens with -- a
 * rotated passphrase should read as "enter it again", not as a new failure.
 *
 * Zero runtime imports beyond the lexicon, which is itself client-safe: the
 * dialog is a client component. The verified word itself is kept server-side,
 * in gear-passphrase-cookie.ts.
 */

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
