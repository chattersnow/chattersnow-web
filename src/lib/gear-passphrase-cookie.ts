import "server-only";
import { cookies } from "next/headers";

/**
 * The passphrase this browser verified (#1536), kept where page scripts cannot
 * read it: an httpOnly cookie the check action sets and the submit action
 * reads. No expiry, so it lasts the browser session. Host-only, so one
 * tenant's word never travels to another tenant's site.
 *
 * Holding it unlocks nothing by itself: every submit hands it to the
 * database, which compares it with the tenant's current passphrase.
 */
const GEAR_PASSPHRASE_COOKIE = "gear-passphrase";

export async function readGearPassphraseCookie(): Promise<string | null> {
  const value = (await cookies()).get(GEAR_PASSPHRASE_COOKIE)?.value;
  return value?.trim() ? value : null;
}

export async function setGearPassphraseCookie(passphrase: string) {
  (await cookies()).set(GEAR_PASSPHRASE_COOKIE, passphrase, {
    httpOnly: true,
    // Plain http only in local development.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function clearGearPassphraseCookie() {
  (await cookies()).delete(GEAR_PASSPHRASE_COOKIE);
}
