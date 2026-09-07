import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { ensureCurrentPerson } from "@/lib/auth/current-person";
import { personDisplayName } from "@/lib/format";
import { AccountForm } from "./account-form";
import { ReplayTourButton } from "./replay-tour-button";
import { NotificationPreferences } from "./notification-preferences";
import { NOTIFICATION_KINDS } from "@/lib/notifications/kinds";
import { getOrgEmailEnabled } from "@/lib/notifications/settings";
import {
  getCurrentUserPermissions,
  hasAnyPermission,
} from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "My Account",
};

/**
 * Deliberately has no requirePermission guard: this page only ever shows and
 * edits the signed-in user's own record, so every portal user may reach it.
 * The (app) layout already handles the signed-out redirect and the
 * no-permissions-at-all case.
 */
export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const person = await ensureCurrentPerson(supabase);

  // Only the caller's own rows come back: the select policy on
  // person_notification_preferences is scoped to my_person_id().
  const [{ data: preferenceRows }, orgEmailEnabled, permissions] =
    await Promise.all([
      supabase.from("person_notification_preferences").select("kind, enabled"),
      getOrgEmailEnabled(supabase),
      getCurrentUserPermissions(supabase),
    ]);
  const enabledByKind: Record<string, boolean> = {};
  for (const row of preferenceRows ?? []) {
    enabledByKind[row.kind as string] = Boolean(row.enabled);
  }

  // Some kinds only exist for the people who own the queue they report on
  // (#742). Showing a volunteer a "New volunteer applications" switch would be
  // offering them a setting that can never change anything -- the sender
  // resolves recipients from the same permission, so the toggle would be inert
  // either way round.
  const kinds = NOTIFICATION_KINDS.filter(({ requires }) => {
    if (!requires) return true;
    return hasAnyPermission(
      permissions,
      requires.resources.map((resource) => ({
        resource,
        level: requires.level,
      })),
    );
  });

  const fallbackName = personDisplayName(
    {
      name:
        person?.name ??
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined),
      email: user.email,
    },
    user.email ?? "",
  );

  return (
    <>
      <div className="w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          My Account
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>

      <div className="mt-6 max-w-xl space-y-6">
        <Card>
          <CardContent className="space-y-4">
            <div>
              <p className="app-eyebrow">Signed in as</p>
              <p className="text-sm font-medium">{user.email}</p>
            </div>
            <AccountForm
              preferredName={person?.preferred_name ?? null}
              pronouns={person?.pronouns ?? null}
              fallbackName={fallbackName}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div>
              <p className="app-eyebrow">Email notifications</p>
              <p className="app-muted mt-1 text-sm">
                Nothing is sent unless you turn it on here.
              </p>
            </div>
            <NotificationPreferences
              kinds={kinds}
              enabledByKind={enabledByKind}
              orgEmailEnabled={orgEmailEnabled}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div>
              <p className="app-eyebrow">Portal introduction</p>
              <p className="app-muted mt-1 text-sm">
                A short walkthrough of the portal basics — the sidebar, the help
                button, and the notifications bell.
              </p>
            </div>
            <ReplayTourButton />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
