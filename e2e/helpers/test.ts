import { test as base, expect } from "@playwright/test";

/**
 * A random 10.x address, matching `uniqueIp()` in `test/integration-setup.ts`.
 * Random rather than sequential: the rate limiter keys on (route, ip) over a
 * 15-minute window, so a counter that restarts at 1 on every run would collide
 * with addresses a previous run used inside that window.
 */
export function uniqueIp() {
  const octet = () => Math.floor(Math.random() * 256);
  return `10.${octet()}.${octet()}.${octet()}`;
}

/**
 * The e2e `test`, extended so every test arrives at the app as its own client.
 *
 * Every rate-limited public route is capped per `(route, ip_address)` over a
 * 15-minute window by `check_rate_limit`. Without this, every browser-driven
 * submission in the suite reaches the dev server as `::ffff:127.0.0.1` and
 * lands in one bucket per route -- so the suite blew through limits of 5-10
 * on its own, and whichever tests happened to run after a threshold was
 * crossed were the ones that failed. Two browser projects doubled the count,
 * the nightly four-project matrix quadrupled it (#587).
 *
 * Next's dev server only fills in `x-forwarded-for` when the request doesn't
 * already carry one, so the address set here is what `getClientIp()` reads.
 * The integration suite solved the same problem with `uniqueIp()`; this is
 * the browser-side equivalent.
 *
 * Import `test` and `expect` from here rather than from `@playwright/test`.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use) => {
    // Playwright's fixture callback, not a React hook -- the lint rule only
    // sees the name.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use({ ...extraHTTPHeaders, "x-forwarded-for": uniqueIp() });
  },
});

export { expect };
