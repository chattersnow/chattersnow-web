"use client";

import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PortalFormSurface,
  PortalFormSurfaceClose,
} from "@/components/portal/portal-form-surface";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  AS_IS_LINK_DAYS,
  AS_IS_REQUEST_ERRORS,
  describeAsIsRequests,
  resolveAsIsRequests,
  type AsIsRequestCandidate,
} from "@/lib/gear-request-as-is-requests";
import { askAllToAcknowledgeAsIsAction } from "./actions";

/**
 * Email every requester whose request has no as-is acknowledgement their own
 * link to give it (#1518). The count is resolved here and again in the action
 * from the same pure function, as #1502's dialog does: the browser's copy
 * makes the number honest, the server's makes it safe.
 */
export function AskAllAsIsDialog({
  candidates,
  disabledReason,
}: {
  /** Every request not cancelled and not acknowledged, whatever the filter. */
  candidates: readonly AsIsRequestCandidate[];
  /** Set when nothing can be sent: org email is switched off. */
  disabledReason?: string;
}) {
  const fieldId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const [includeRecent, setIncludeRecent] = useState(false);
  const [openedAt, setOpenedAt] = useState(() => Date.now());

  const resolved = useMemo(
    () => resolveAsIsRequests(candidates, { includeRecent, now: openedAt }),
    [candidates, includeRecent, openedAt],
  );
  const count = resolved.recipients.length;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setBatchId(crypto.randomUUID());
      setIncludeRecent(false);
      setOpenedAt(Date.now());
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await askAllToAcknowledgeAsIsAction({
        batchId,
        includeRecent,
      });
      if ("error" in result) {
        setError(result.error);
        setBatchId(crypto.randomUUID());
        return;
      }
      toast.success(
        `Sending to ${result.recipients} ${result.recipients === 1 ? "requester" : "requesters"}.`,
        {
          description:
            "Each request shows “As-is requested” now. A send that fails is listed in that request's messages and its link is withdrawn.",
        },
      );
      setOpen(false);
      router.refresh();
    });
  }

  const trigger = (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={Boolean(disabledReason)}
    >
      Ask to acknowledge as-is
    </Button>
  );

  if (disabledReason) {
    return (
      <div className="flex flex-col gap-1">
        {trigger}
        <p className="app-muted text-xs">{disabledReason}</p>
      </div>
    );
  }

  return (
    <PortalFormSurface
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      title="Ask to acknowledge as-is"
      description="Each requester gets their own link to read how items are given away and confirm it — no account needed."
      onSubmit={handleSubmit}
      footer={
        <>
          <PortalFormSurfaceClose
            render={<Button type="button" variant="secondary" />}
          >
            Cancel
          </PortalFormSurfaceClose>
          <Button type="submit" disabled={isPending || count === 0}>
            {isPending ? <Spinner /> : null}
            {count > 0
              ? `Send to ${count} ${count === 1 ? "requester" : "requesters"}`
              : "Send"}
          </Button>
        </>
      }
    >
      <div className="py-2">
        <FieldGroup>
          <p className="text-sm" role="status">
            {describeAsIsRequests(resolved)}
          </p>
          <Field orientation="horizontal">
            <Checkbox
              id={`${fieldId}-recent`}
              checked={includeRecent}
              onCheckedChange={(checked) => setIncludeRecent(checked === true)}
            />
            <FieldLabel htmlFor={`${fieldId}-recent`} className="font-normal">
              Include anyone asked in the last 24 hours
            </FieldLabel>
          </Field>
          <p className="app-muted text-xs">
            {`The link shows only the requester's first name, the items on their request and the current as-is wording, and works for ${AS_IS_LINK_DAYS} days or until it is used.`}
          </p>
          {count === 0 ? (
            <Alert>
              <AlertDescription>
                {AS_IS_REQUEST_ERRORS.NO_RECIPIENTS}
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </div>
    </PortalFormSurface>
  );
}
