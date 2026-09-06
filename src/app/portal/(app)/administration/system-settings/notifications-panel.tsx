"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateEmailNotificationsEnabledAction,
  type SettingActionResult,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
// Type-only, like the other panels here: @/lib/notifications/kinds is a pure
// registry, but keeping the import shape consistent makes it obvious that the
// value itself arrives as a prop from the server page.
import type { NotificationKind } from "@/lib/notifications/kinds";

export function NotificationsPanel({
  emailEnabled,
  kinds,
}: {
  emailEnabled: boolean;
  kinds: NotificationKind[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Same reasoning as PageVisibilityRow: useOptimistic drops back to the
  // server's value when the transition ends, so the switch can never keep
  // showing a change the server did not make.
  const [checked, setChecked] = useOptimistic(emailEnabled);
  const [isPending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    setError(null);

    startTransition(async () => {
      setChecked(next);
      await runAction<SettingActionResult>(
        () => updateEmailNotificationsEnabledAction(next),
        {
          success: next
            ? "Outbound email is on."
            : "Outbound email is off for this organization.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p id="email-enabled-label" className="text-sm font-medium">
                Send outbound email
              </p>
              <p className="app-muted mt-1 text-sm leading-relaxed">
                When this is off, the portal sends no email at all — no
                reminders, no notifications — no matter what anyone has turned
                on for themselves. Turn it off if messages are going somewhere
                they shouldn&rsquo;t; nothing queues up while it is off.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              {isPending ? <Spinner className="size-4" /> : null}
              <span className="app-muted w-8 text-right text-xs">
                {checked ? "On" : "Off"}
              </span>
              <Switch
                checked={checked}
                onCheckedChange={handleChange}
                disabled={isPending}
                aria-labelledby="email-enabled-label"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div>
            <p className="app-eyebrow">What the portal can send</p>
            <p className="app-muted mt-1 text-sm leading-relaxed">
              Each person chooses which of these they want, on their own account
              page. Nobody receives anything they have not turned on.
            </p>
          </div>
          <ul className="space-y-3">
            {kinds.map((kind) => (
              <li key={kind.key}>
                <p className="text-sm font-medium">{kind.label}</p>
                <p className="app-muted text-sm leading-relaxed">
                  {kind.description}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
