"use client";

import { useEffect } from "react";
import {
  SERVICE_WORKER_URL,
  serviceWorkerScope,
  shouldRegisterServiceWorker,
} from "@/lib/pwa/service-worker";

/**
 * Installs the portal's service worker (#1083).
 *
 * Mounted in both shells rather than only the mobile one: a phone is what the
 * app is *for*, but a laptop on a venue's wifi drops the same connection, and
 * the worker's whole job -- serve the immutable chunks, show an honest offline
 * page -- is worth having on either.
 *
 * Renders nothing. A failed registration is logged and otherwise ignored:
 * every page in the portal works without a worker, which is how it has always
 * worked, so there is nothing to tell the operator about.
 */
export function ServiceWorkerRegistrar() {
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
      .register(SERVICE_WORKER_URL, {
        scope: serviceWorkerScope(window.location.hostname),
      })
      .catch((error) => {
        console.error("[pwa] could not register the service worker", error);
      });
  }, []);

  return null;
}
