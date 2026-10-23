import type { RegistrationStep } from "@/app/(public)/events/registration-step";

/**
 * The event registration funnel (#1480): every event the public site sends to
 * PostHog about a registration form, and the only properties each may carry.
 *
 * This file is where the no-PII rule lives. A registration form holds names,
 * phone numbers and, on some tenants, a minor's and an emergency contact's, so
 * nothing about the person is ever a property here -- no name, email, phone,
 * registration id or free text. What is allowed is the event, the step and an
 * RPC error *code* (never its message). `tenant` is not passed per call: the
 * provider registers it once for every event the page sends, `$pageview`
 * included.
 *
 * The map is the allowlist. An object literal with a key outside it is a type
 * error at the call site, and anything that slips past the types is dropped
 * below before it leaves the browser.
 */
export type RegistrationEvents = {
  registration_opened: Record<never, never>;
  registration_step_viewed: { step: RegistrationStep };
  registration_submitted: Record<never, never>;
  registration_completed: Record<never, never>;
  registration_failed: { step: RegistrationStep; error_code: string };
};

export type RegistrationEventName = keyof RegistrationEvents;

const ALLOWED_PROPERTIES: Record<RegistrationEventName, readonly string[]> = {
  registration_opened: [],
  registration_step_viewed: ["step"],
  registration_submitted: [],
  registration_completed: [],
  registration_failed: ["step", "error_code"],
};

type Capture = (event: string, properties: Record<string, string>) => void;

/**
 * Set by the provider once PostHog has loaded, and null everywhere it has not:
 * a tenant without the `form_analytics` module, any deploy that is not
 * production, the portal. Holding the function rather than importing
 * `posthog-js` here keeps the library out of the bundle of every page that
 * merely renders a registration form.
 */
let capture: Capture | null = null;

export function setRegistrationCapture(next: Capture | null): void {
  capture = next;
}

/** Sends one funnel event, or does nothing when analytics is off. */
export function trackRegistration<E extends RegistrationEventName>(
  event: E,
  properties: { event_id: string } & RegistrationEvents[E],
): void {
  // An event outside the map, past the types, is not sent at all.
  const extra = ALLOWED_PROPERTIES[event];
  if (!capture || !extra) return;
  const allowed = ["event_id", ...extra];
  const sent: Record<string, string> = {};
  for (const key of allowed) {
    const value = (properties as Record<string, unknown>)[key];
    if (typeof value === "string") sent[key] = value;
  }
  capture(event, sent);
}
