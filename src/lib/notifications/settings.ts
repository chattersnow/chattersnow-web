import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMAIL_ENABLED_DEFAULT,
  EMAIL_ENABLED_SETTING_KEY,
} from "@/lib/notifications/kinds";

/**
 * Two readers for one switch, because two very different callers need it.
 *
 * A signed-in session reads it through the org_notification_settings view
 * (20260906140000): app_settings' own select policy admits only the managers of
 * the resources that read it, so an ordinary user on /portal/account cannot
 * query the table, but does need to be told why their enabled toggle is sending
 * nothing.
 *
 * The digest job reads it straight off app_settings with an explicit tenant_id,
 * because it runs on the service-role client with no session at all --
 * current_tenant_id() is null there, so the view would return nothing and a
 * null would read as "not configured", i.e. as on. Passing the tenant is the
 * whole point: the switch is per tenant and the job walks several.
 */

/** The switch for the signed-in user's own tenant. */
export async function getOrgEmailEnabled(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("org_notification_settings")
    .select("email_enabled")
    .maybeSingle();

  // Falling back to the default is right -- an unreadable switch must not
  // silently mute a person's reminders -- but it must not be silent either:
  // the page-visibility view was missing in production for a while and the
  // swallowed PGRST205 made the toggles look like they simply refused to save.
  if (error) {
    console.error(
      "[notifications] could not read org_notification_settings; falling back to the default",
      error,
    );
    return EMAIL_ENABLED_DEFAULT;
  }

  return resolveEnabled(data?.email_enabled);
}

/** The switch for one named tenant, for the service-role sender. */
export async function isOrgEmailEnabled(
  admin: SupabaseClient,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("app_settings")
    .select("value")
    .eq("tenant_id", tenantId)
    .eq("key", EMAIL_ENABLED_SETTING_KEY)
    .maybeSingle();

  // Fails closed, unlike the reader above. A missing row means "on", but a
  // failed *read* means the switch's position is unknown -- and the one thing
  // this switch exists to prevent is mail going out after somebody turned it
  // off. Sending nothing for a night is recoverable; the other way round is
  // not. Same reasoning as fetchOptedIn() in task-digest-job.ts.
  if (error) {
    console.error(
      `[notifications] could not read the email switch for tenant ${tenantId}; sending nothing for it`,
      error,
    );
    return false;
  }

  return resolveEnabled(data?.value);
}

/**
 * Anything that is not an explicit boolean -- a missing row, a null, a value
 * typed by hand into the table -- is the registry default rather than a guess.
 * That is different from a failed read, which each caller handles for itself.
 */
function resolveEnabled(value: unknown): boolean {
  return typeof value === "boolean" ? value : EMAIL_ENABLED_DEFAULT;
}
