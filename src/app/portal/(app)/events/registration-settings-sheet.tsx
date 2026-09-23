"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { runAction } from "@/components/portal/action-toast";
import { PARTY_INCLUDES_MINOR_QUESTION } from "@/lib/minors";
import {
  updateAsksAboutMinorsAction,
  type RegistrationSettingsResult,
} from "./registration-settings-actions";

/**
 * This organization's public registration settings (#1416).
 *
 * A sheet on the Events page, the shape the Mountains sheet beside it took and
 * for its reason: one setting that shapes one form does not earn a route or a
 * nav entry. Saved on toggle, like the switches on Website > Legal documents.
 */
export function RegistrationSettingsSheet({
  asksAboutMinors,
}: {
  asksAboutMinors: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(asksAboutMinors);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setChecked(asksAboutMinors);
      setError(null);
    }
  }

  function handleChange(next: boolean) {
    setError(null);
    setChecked(next);
    startTransition(async () => {
      const outcome = await runAction<RegistrationSettingsResult>(
        () => updateAsksAboutMinorsAction(next),
        {
          success: next
            ? "Registration now asks about under-18s."
            : "Registration no longer asks about under-18s.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
      if (!outcome.ok) setChecked(!next);
    });
  }

  return (
    <Sheet onOpenChange={handleOpenChange}>
      <SheetTrigger render={<Button type="button" variant="outline" />}>
        <ClipboardList className="size-4" />
        Registration
      </SheetTrigger>
      <SheetContent side="right" size="md">
        <SheetHeader>
          <SheetTitle>Registration</SheetTitle>
          <SheetDescription>
            What the public registration form asks, for every event.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p
                id="registration-asks-about-minors-label"
                className="text-sm font-medium"
              >
                Ask about under-18s at registration
              </p>
              <p
                id="registration-asks-about-minors-help"
                className="app-muted mt-1 text-sm"
              >
                Asks &ldquo;{PARTY_INCLUDES_MINOR_QUESTION}&rdquo; and, on a
                yes, for an accompanying adult and an emergency contact. Turning
                it off stops asking; answers already given stay on their
                registrations until they are cleared on the usual schedule.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isPending && <Spinner className="size-4" />}
              <Switch
                checked={checked}
                onCheckedChange={handleChange}
                disabled={isPending}
                aria-labelledby="registration-asks-about-minors-label"
                aria-describedby="registration-asks-about-minors-help"
              />
            </div>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
