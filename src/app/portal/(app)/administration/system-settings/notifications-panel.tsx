"use client";

import { FormEvent, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateEmailNotificationsEnabledAction,
  updateOpsReportRecipientsAction,
  updateSenderIdentityAction,
  type SettingActionResult,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/components/portal/action-toast";
// Type-only, like the other panels here: @/lib/notifications/kinds is a pure
// registry, but keeping the import shape consistent makes it obvious that the
// value itself arrives as a prop from the server page.
import type { NotificationKind } from "@/lib/notifications/kinds";

export function NotificationsPanel({
  emailEnabled,
  kinds,
  opsReportRecipients,
  orgName,
  platformFrom,
  sendingDomain,
  replyTo,
  fromAddress,
}: {
  emailEnabled: boolean;
  kinds: NotificationKind[];
  opsReportRecipients: string[];
  orgName: string;
  /** EMAIL_FROM, as the address recipients see when nothing overrides it. */
  platformFrom: string | null;
  /** This tenant's own domain, when it is verified for sending. Null disables the field. */
  sendingDomain: string | null;
  replyTo: string | null;
  fromAddress: string | null;
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

      <SenderIdentityCard
        orgName={orgName}
        platformFrom={platformFrom}
        sendingDomain={sendingDomain}
        replyTo={replyTo}
        fromAddress={fromAddress}
      />

      <OpsReportRecipientsCard recipients={opsReportRecipients} />

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

/**
 * Who this organization's mail comes from, and where a reply goes (#857).
 *
 * The Reply-To is the half that matters most and the half anyone can set: mail
 * leaves through one provider while the mailboxes people read are with another,
 * so a reply to the sending address bounces unless this points somewhere real.
 *
 * The From address is not self-service, and the field says so by being
 * read-only until it can work. Sending from a domain means the operator has
 * verified it with the provider and published DNS records for it, which is not
 * something a button here can do -- and an editable box that silently ignored
 * what was typed into it would be worse than no box at all.
 */
function SenderIdentityCard({
  orgName,
  platformFrom,
  sendingDomain,
  replyTo,
  fromAddress,
}: {
  orgName: string;
  platformFrom: string | null;
  sendingDomain: string | null;
  replyTo: string | null;
  fromAddress: string | null;
}) {
  const router = useRouter();
  const [replyToValue, setReplyToValue] = useState(replyTo ?? "");
  const [fromValue, setFromValue] = useState(fromAddress ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const sender = fromValue.trim() || platformFrom || "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateSenderIdentityAction(formData),
        {
          success: "Sender details updated.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <div>
              <p className="app-eyebrow">Who your email comes from</p>
              <p className="app-muted mt-1 text-sm leading-relaxed">
                Everything this portal sends goes out under your
                organization&rsquo;s name. Recipients see{" "}
                <span className="text-foreground">
                  {sender ? `"${orgName}" <${sender}>` : `"${orgName}"`}
                </span>
                .
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="mail-reply-to">Reply-To address</FieldLabel>
              <Input
                id="mail-reply-to"
                name="replyTo"
                type="email"
                spellCheck={false}
                placeholder="hello@example.org"
                value={replyToValue}
                onChange={(event) => setReplyToValue(event.target.value)}
              />
              <FieldDescription>
                Where a reply lands when somebody answers one of these messages.
                The address above is a sending address that nobody reads, so
                without this a reply bounces. Leave it empty to use the
                platform&rsquo;s.
              </FieldDescription>
            </Field>

            {sendingDomain ? (
              <Field>
                <FieldLabel htmlFor="mail-from-address">
                  Send from your own address
                </FieldLabel>
                <Input
                  id="mail-from-address"
                  name="fromAddress"
                  type="email"
                  spellCheck={false}
                  placeholder={`hello@${sendingDomain}`}
                  value={fromValue}
                  onChange={(event) => setFromValue(event.target.value)}
                />
                <FieldDescription>
                  Must be an address at {sendingDomain}. Leave it empty to send
                  from the platform&rsquo;s address instead.
                </FieldDescription>
              </Field>
            ) : (
              <>
                <input type="hidden" name="fromAddress" value={fromValue} />
                <ReadOnlyField
                  label="Sending address"
                  htmlFor="mail-from-fixed"
                >
                  {platformFrom ?? "Not configured"}
                </ReadOnlyField>
                <FieldDescription>
                  Sending from your own domain needs your platform operator to
                  verify it with the email provider first. Ask them to set it up
                  and this becomes editable.
                </FieldDescription>
              </>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * The leadership ops report's recipients (#743).
 *
 * A free-text list rather than a person picker, because the address is
 * routinely a distribution list -- board@, leadership@ -- with no `people` row
 * and no portal account behind it. That is also why this report sits outside
 * the per-person preferences above: nobody can opt themselves in or out of an
 * inbox they do not own. Leaving the field empty switches the report off.
 */
function OpsReportRecipientsCard({ recipients }: { recipients: string[] }) {
  const router = useRouter();
  const [value, setValue] = useState(recipients.join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await runAction<SettingActionResult>(
        () => updateOpsReportRecipientsAction(formData),
        {
          success: "Daily ops report recipients updated.",
          onError: setError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ops-report-recipients">
                Daily ops report recipients
              </FieldLabel>
              <Textarea
                id="ops-report-recipients"
                name="recipients"
                rows={3}
                spellCheck={false}
                placeholder="leadership@example.org"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              <FieldDescription>
                One address per line (commas work too). Each morning these
                addresses get a summary of the day: approvals waiting, events
                and shift gaps in the next week, new messages and applications,
                and donations received. Leave this empty to send no report at
                all. Every change here is recorded in the audit log.
              </FieldDescription>
            </Field>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Spinner /> Saving...
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
