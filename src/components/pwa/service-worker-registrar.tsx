"use client";

import { useEffect } from "react";
import {
  SERVICE_WORKER_URL,
  shouldRegisterServiceWorker,
} from "@/lib/pwa/service-worker";

/**
 * Installs one surface's service worker (#1083, #1171).
 *
 * Mounted in both portal shells rather than only the mobile one, and in the
 * public layout beside them: a phone is what the apps are *for*, but a laptop
 * on a venue's wifi drops the same connection, and the worker's whole job --
 * serve the immutable chunks, show an honest offline page -- is worth having
 * on either, on either surface.
 *
 * `scope` is handed down rather than derived here. The server already knows
 * the request host and which of the two apps it is rendering, and a client
 * that worked it out again from `window.location` would be a second host rule
 * to keep in step with the manifest's.
 *
 * Renders nothing. A failed registration is logged and otherwise ignored:
 * every page works without a worker, which is how it has always worked, so
 * there is nothing to tell the operator about.
 */
export function ServiceWorkerRegistrar({ scope }: { scope: string }) {
  useEffect(() => {
    if (
      !shouldRegisterServiceWorker(
        navigator,
        process.env.NODE_ENV === "production",
      )
    ) {
      return;
    }
    navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope })
      .catch((error) => {
        console.error("[pwa] could not register the service worker", error);
      });
  }, [scope]);

  return null;
}
