import { after } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";
import type { NotificationEmailContext } from "./notification-email-core";

/**
 * The Next half of the notification-email split (#1125): the two things the
 * core deliberately does not know how to do.
 *
 * The origin is read here, before the core runs, because `after()` runs once
 * the response is on its way and may no longer have the request's headers --
 * so reading it inside the deferred task would yield the environment fallback
 * and link a tenant's recipient at somebody else's domain.
 *
 * Not in either `"use server"` file: everything a module with that directive
 * exports becomes a callable endpoint, and this is neither an action nor
 * something a browser should be able to reach.
 */
export async function requestNotificationEmailContext(): Promise<NotificationEmailContext> {
  return {
    origin: await getRequestOrigin(),
    schedule: (task) => after(task),
  };
}
