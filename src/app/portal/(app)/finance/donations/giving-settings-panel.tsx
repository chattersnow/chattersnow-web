"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateGivingSettingsAction,
  type DonationActionResult,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { runAction } from "@/components/portal/action-toast";
import { RequiredFieldsNote } from "@/components/required-fields-note";
import {
  GIVING_MODES,
  MAX_GIVING_URL_LENGTH,
  MAX_PROVIDER_LABEL_LENGTH,
  MAX_SUGGESTED_AMOUNTS,
  formatGivingAmount,
  givingUrlError,
  isGivingMode,
  parseSuggestedAmounts,
  type GivingMode,
  type GivingSettings,
} from "@/lib/giving";

const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** "25, 50, 100" in, `[25, 50, 100]` out. Blank entries are not typos. */
function readAmounts(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((part) => part.replace(/[$,]/g, "").trim())
    .filter(Boolean)
    .map((part) => Number(part));
}

/**
 * Where this organization's online gifts are actually made (#1389): the page
 * that hosts the giving form, how it opens, and the amounts to put on it.
 *
 * Lives here rather than in Administration > Organization Settings because it
 * shapes exactly one feature (docs/portal-navigation.md) -- the same call the
 * gear-request delivery settings made.
 *
 * There is no list of processors to choose from, and that is deliberate: the
 * platform is in no position to recommend one, the organization is the
 * merchant of record whichever it picks, and money never passes through this
 * software. Whatever is typed in "Provider name" renders publicly only as
 * "opens on {name}".
 */
export function GivingSettingsPanel({
  settings,
}: {
  settings: GivingSettings;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [providerLabel, setProviderLabel] = useState(settings.providerLabel);
  const [url, setUrl] = useState(settings.url);
  const [mode, setMode] = useState<GivingMode>(settings.mode);
  const [amountsText, setAmountsText] = useState(
    settings.suggestedAmounts.join(", "),
  );
  const [amountParam, setAmountParam] = useState(settings.amountParam);
  const [recurringAvailable, setRecurringAvailable] = useState(
    settings.recurringAvailable,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const amounts = readAmounts(amountsText);
  const previewAmounts = amountParam ? parseSuggestedAmounts(amounts) : [];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Said here as well as in the action and in set_giving_settings(), and
    // this is the copy that matters least and helps most: the database is
    // where the guarantee holds, but a typed address should not need a round
    // trip to be told it is missing its scheme. An empty address is fine --
    // it is how giving is cleared -- unless the switch is on.
    const trimmedUrl = url.trim();
    if (trimmedUrl) {
      const urlError = givingUrlError(trimmedUrl);
      if (urlError) {
        setError(urlError);
        return;
      }
    } else if (enabled) {
      setError(
        "Paste the address of your giving page before switching giving on.",
      );
      return;
    }

    startTransition(async () => {
      await runAction<DonationActionResult>(
        () =>
          updateGivingSettingsAction({
            enabled,
            providerLabel,
            url,
            mode,
            suggestedAmounts: amounts,
            amountParam,
            recurringAvailable,
          }),
        {
          success: "Giving settings saved.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="app-muted text-sm font-semibold">
          Online giving
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <RequiredFieldsNote />
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <p className="app-muted text-sm leading-relaxed">
              Your giving page is hosted by whoever you collect through — a
              giving platform, a payment link, or a fiscal sponsor&apos;s own
              page. Point this at it and the public site grows a Give card and a
              permanent short address, <strong>/support/donate</strong>, that
              survives you changing providers. Gifts are never taken by this
              software and never pass through it: your organization stays the
              one being paid.
            </p>

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p id="giving-enabled-label" className="text-sm font-medium">
                  Show the Give card
                </p>
                <p className="app-muted mt-1 text-sm leading-relaxed">
                  Off means nothing about giving appears anywhere on your public
                  site and /support/donate is not a page. You can fill the rest
                  of this in first and switch it on when you are ready.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <span className="app-muted w-8 text-right text-xs">
                  {enabled ? "On" : "Off"}
                </span>
                <Switch
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  disabled={isPending}
                  aria-labelledby="giving-enabled-label"
                />
              </div>
            </div>

            <Field>
              <FieldLabel htmlFor="giving-url" required={enabled}>
                Giving page address
              </FieldLabel>
              <Input
                id="giving-url"
                type="url"
                inputMode="url"
                maxLength={MAX_GIVING_URL_LENGTH}
                placeholder="https://..."
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <FieldDescription>
                The whole address, starting with https://. Open your giving page
                in a browser and copy it from the address bar.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="giving-provider-label">
                Provider name
              </FieldLabel>
              <Input
                id="giving-provider-label"
                maxLength={MAX_PROVIDER_LABEL_LENGTH}
                placeholder="Our fiscal sponsor's page"
                value={providerLabel}
                onChange={(event) => setProviderLabel(event.target.value)}
              />
              <FieldDescription>
                Shown beside the button as &ldquo;opens on{" "}
                {providerLabel.trim() || "…"}&rdquo;, so a visitor is not
                surprised by the page they land on. Leave it blank to say
                nothing.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="giving-mode">How it opens</FieldLabel>
              <select
                id="giving-mode"
                className={selectClassName}
                value={mode}
                onChange={(event) =>
                  setMode(
                    isGivingMode(event.target.value)
                      ? event.target.value
                      : "link",
                  )
                }
                disabled={isPending}
              >
                {GIVING_MODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <FieldDescription>
                {
                  GIVING_MODES.find((option) => option.value === mode)
                    ?.description
                }
              </FieldDescription>
            </Field>

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="giving-amounts">
                  Suggested amounts
                </FieldLabel>
                <Input
                  id="giving-amounts"
                  inputMode="numeric"
                  placeholder="25, 50, 100"
                  value={amountsText}
                  onChange={(event) => setAmountsText(event.target.value)}
                />
                <FieldDescription>
                  Up to {MAX_SUGGESTED_AMOUNTS} whole amounts, separated by
                  commas.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="giving-amount-param">
                  Amount parameter
                </FieldLabel>
                <Input
                  id="giving-amount-param"
                  placeholder="amount"
                  value={amountParam}
                  onChange={(event) => setAmountParam(event.target.value)}
                />
                <FieldDescription>
                  What your provider calls the amount in its own web address.
                  Give yours once with an amount chosen and look for something
                  like <code>?amount=25</code>. Leave it blank if there is
                  nothing like that — the buttons then do nothing, so they are
                  not shown.
                </FieldDescription>
              </Field>
            </Field>

            <p className="app-muted text-sm leading-relaxed">
              {previewAmounts.length > 0 ? (
                <>
                  Visitors will see{" "}
                  {previewAmounts.map(formatGivingAmount).join(", ")} as
                  buttons, plus one for any other amount.
                </>
              ) : (
                <>
                  Visitors will see a single Give button. Amount buttons need
                  both an amount parameter and at least one amount.
                </>
              )}
            </p>

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p id="giving-recurring-label" className="text-sm font-medium">
                  Monthly giving is available
                </p>
                <p className="app-muted mt-1 text-sm leading-relaxed">
                  Adds one line to the Give card saying people can also give
                  monthly. It changes nothing about how giving works — set that
                  up with your provider.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <span className="app-muted w-8 text-right text-xs">
                  {recurringAvailable ? "On" : "Off"}
                </span>
                <Switch
                  checked={recurringAvailable}
                  onCheckedChange={setRecurringAvailable}
                  disabled={isPending}
                  aria-labelledby="giving-recurring-label"
                />
              </div>
            </div>

            <p className="app-muted text-sm leading-relaxed">
              What a gift is worth at tax time is your organization&apos;s own
              statement to make, so it is not here: write it in Administration
              &gt; Site Content, on the Support page, under &ldquo;Tax
              note&rdquo;. Left blank, nothing is claimed.
            </p>

            <div className="flex items-center justify-end gap-2">
              {isPending ? <Spinner className="size-4" /> : null}
              <Button type="submit" disabled={isPending}>
                Save settings
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
