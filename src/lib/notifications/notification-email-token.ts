import { createHash, randomBytes } from "node:crypto";

/**
 * The confirmation token for a notification-address change (#1049).
 *
 * The raw token exists in exactly two places: the email that carries it, and
 * the link the recipient follows back. The database stores only its SHA-256, so
 * a backup, a log line or a `select *` by anyone holding people:view yields
 * nothing that can confirm an address -- the same reason password resets are
 * built this way, and the reason `notification_email_pending` is worth
 * separating from `notification_email` at all.
 *
 * A plain hash rather than a slow KDF: the input is 256 bits of CSPRNG output
 * with no structure to guess at, so there is no dictionary for a work factor to
 * defend against, and the token lives for a day.
 */
export const CONFIRMATION_TOKEN_BYTES = 32;

export function mintConfirmationToken(): { token: string; hash: string } {
  const token = randomBytes(CONFIRMATION_TOKEN_BYTES).toString("hex");
  return { token, hash: hashConfirmationToken(token) };
}

export function hashConfirmationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Whether a value is shaped like a token this module minted. The confirm
 * action checks it before hashing so a stray query parameter never becomes a
 * database lookup; the SQL side checks the resulting hash's shape again.
 */
export function isConfirmationToken(value: string): boolean {
  return new RegExp(`^[0-9a-f]{${CONFIRMATION_TOKEN_BYTES * 2}}$`).test(value);
}
