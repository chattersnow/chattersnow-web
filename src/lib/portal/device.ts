import { headers } from "next/headers";
import { DEVICE_HEADER, type DeviceClass } from "@/proxy";

export type { DeviceClass };

/**
 * Which shell this request gets (#1079).
 *
 * The one reader of `x-device`. Nothing else re-derives the decision: the
 * proxy makes it, this returns it, and every branch -- the portal layout's
 * two shells, the dashboard's two dashboards -- asks here. A second derivation
 * is how the desktop and mobile answers drift apart within one render.
 *
 * Defaults to `desktop` for any value it doesn't recognise, including a
 * missing header. A portal page rendered outside the proxy's matcher (or in a
 * unit test) then behaves exactly as it did before this existed.
 */
export async function deviceClass(): Promise<DeviceClass> {
  const requestHeaders = await headers();
  return requestHeaders.get(DEVICE_HEADER) === "mobile" ? "mobile" : "desktop";
}
