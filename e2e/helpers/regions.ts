import type { Locator, Page } from "@playwright/test";

/**
 * The portal's content region -- whatever the current page rendered into the
 * layout's `<main id="portal-main">`.
 *
 * Scope every `#id` lookup on portal page content through this. A
 * document-wide `page.locator("#some-id")` is not unique on a freshly loaded
 * portal page for the first few hundred milliseconds (#803):
 *
 * Portal routes have a `loading.tsx`, which makes the page segment a React
 * Suspense boundary. The server therefore streams the layout shell first and
 * the page content afterwards, appended to `<body>` inside a
 * `<div hidden id="S:n">` for an inline script to splice into place. React 19
 * defers that splice until the stylesheets the boundary needs have loaded, and
 * this app requests its CSS 150-330ms after DOMContentLoaded (#752) -- long
 * enough for the client to hydrate and render the same content into the layout
 * on its own first. Until the splice finally runs and drops the buffer, the
 * page content is in the document twice and every id inside it resolves to two
 * elements, tripping Playwright's strict mode. Confirmed from the trace of the
 * run in #803: the leftover `<div hidden id="S:3">` held a byte-identical copy
 * of the asset detail page, and it was gone ~200ms later.
 *
 * That buffer hangs off `<body>`, never inside the layout, so scoping to the
 * content region is what makes the lookup unambiguous -- and `#portal-main`
 * itself stays unique because the boundary sits below it. Content portalled to
 * `<body>` (dialogs, sheets, toasts) is outside this region; scope that with
 * `modal()` instead, which is already immune because a dialog is only ever
 * client-rendered and so never reaches the stream.
 */
export function portalMain(page: Page): Locator {
  return page.locator("#portal-main");
}
