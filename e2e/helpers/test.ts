import { test as base, expect, type Page } from "@playwright/test";

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
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await settleStreamedContent(page);
      return response;
    };
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

/** Longest a navigation waits for React to place its streamed content. */
const STREAM_SETTLE_TIMEOUT_MS = 10_000;

/**
 * Waits until React has moved every server-streamed Suspense boundary into
 * place.
 *
 * Since the suite moved to a production build (#744), the server streams each
 * boundary's HTML into a `<div hidden id="S:n">` and an inline script relocates
 * it. Playwright's `load` can fire while one is still parked, and until the
 * swap runs the document holds TWO copies of that content -- the placed one and
 * the hidden one. Any locator that isn't scoped to a container then trips
 * strict mode:
 *
 *   strict mode violation: getByText('Happening now') resolved to 2 elements
 *
 * and because the hidden copy is the one it resolves first, the failure reads
 * as "unexpected value hidden". On a loaded runner the window outlasted the
 * 15s assertion budget, so it failed all three attempts (#756). `next dev`
 * does not stream the same way, which is why this only appeared on the
 * production build.
 *
 * The empty `<div hidden>` React always leaves behind is ignored -- only a
 * hidden div with element children is still holding content.
 *
 * Bounded and non-fatal: a boundary that genuinely never resolves should fail
 * on the test's own assertion, which names what it was waiting for, rather
 * than here.
 */
async function settleStreamedContent(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll("div[hidden]")].every(
          (div) => div.children.length === 0,
        ),
      undefined,
      { timeout: STREAM_SETTLE_TIMEOUT_MS },
    )
    .catch(() => {});
}

export { expect };
