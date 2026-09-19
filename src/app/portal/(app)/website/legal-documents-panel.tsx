"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { updateLegalPublicationAction } from "./settings-actions";
import type { SettingActionResult } from "@/lib/settings/write-app-setting";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
// Type-only where the module has server helpers: @/lib/legal-documents is the
// registry and is free of them, but the read lives in @/lib/legal-publication,
// which must not reach the client bundle. State arrives as props from the
// server page, same as PageVisibilityPanel.
import type { LegalDocument } from "@/lib/legal-documents";
import { runAction } from "@/components/portal/action-toast";

/** What the public site is currently serving at this document's route. */
export type LegalDocumentStatus = {
  key: string;
  inForce: boolean;
  /** Whether the tenant has published a document of its own for this slot. */
  ownDocument: boolean;
  /**
   * Why this document cannot be taken out of force, when a module that depends
   * on it is on (#1295). Undefined is the ordinary case: nothing is holding it,
   * and the switch works both ways.
   */
  heldInForceBy?: string;
};

function ServingLine({
  document,
  inForce,
  ownDocument,
}: {
  document: LegalDocument;
  inForce: boolean;
  ownDocument: boolean;
}) {
  if (!inForce) {
    return (
      <>
        Not served. {document.route} returns &ldquo;not found&rdquo; and the
        footer omits it.
        {ownDocument
          ? " Your own text is written and waiting."
          : " Nothing of your own is written yet, so putting it in force would serve the platform's starting document."}
      </>
    );
  }
  return (
    <>
      Live at{" "}
      <Link
        href={document.route}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 underline underline-offset-4"
      >
        {document.route}
        <ExternalLink className="size-3.5" aria-hidden />
      </Link>
      , serving{" "}
      {ownDocument
        ? "your own text."
        : "the platform's starting document, because nothing of your own is published for it."}
    </>
  );
}

function LegalDocumentRow({
  document,
  status,
  onError,
}: {
  document: LegalDocument;
  status: LegalDocumentStatus;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  // Same reasoning as PageVisibilityRow: `useOptimistic` rather than plain
  // state, so the switch drops back to the server's own value the moment the
  // transition ends and can never keep showing a change the server refused.
  const [checked, setChecked] = useOptimistic(status.inForce);
  const [isPending, startTransition] = useTransition();
  // Held in force only matters while it *is* in force: a document nothing has
  // adopted yet has nothing depending on it, and the module that would depend
  // on it cannot be turned on until it is.
  const held = status.inForce ? status.heldInForceBy : undefined;

  function handleChange(next: boolean) {
    onError(null);

    startTransition(async () => {
      setChecked(next);
      await runAction<SettingActionResult>(
        () => updateLegalPublicationAction(document.key, next),
        {
          success: `${document.label} is ${next ? "now in force" : "no longer served"}.`,
          onError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

  const labelId = `legal-publication-${document.key}-label`;

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-medium">
          {document.label}
        </p>
        <p className="app-muted mt-1 text-sm leading-relaxed">
          {document.description}
        </p>
        <p className="app-muted mt-1 text-sm leading-relaxed">
          <ServingLine
            document={document}
            inForce={status.inForce}
            ownDocument={status.ownDocument}
          />
        </p>
        {held ? (
          <p className="app-muted mt-1 text-sm leading-relaxed">{held}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {isPending ? <Spinner className="size-4" /> : null}
        <span className="app-muted w-20 text-right text-xs">
          {document.alwaysInForce
            ? "Always on"
            : checked
              ? "In force"
              : "Not adopted"}
        </span>
        {/* The privacy policy has no control at all, rather than a control that
            refuses: a switch whose only correct position is "on" invites
            somebody to try the other one. */}
        {document.alwaysInForce ? null : (
          <Switch
            checked={checked}
            onCheckedChange={handleChange}
            // A held document keeps its switch, unlike the privacy policy's
            // missing one: this is a state the organization can get out of by
            // asking, so the control stays where it was and says why it is
            // stuck (#1295).
            disabled={isPending || Boolean(held)}
            aria-labelledby={labelId}
          />
        )}
      </div>
    </div>
  );
}

export function LegalDocumentsPanel({
  documents,
  statuses,
}: {
  documents: readonly LegalDocument[];
  statuses: readonly LegalDocumentStatus[];
}) {
  const [error, setError] = useState<string | null>(null);
  const byKey = new Map(statuses.map((status) => [status.key, status]));

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent className="divide-y divide-[var(--line)]">
          {documents.map((document) => (
            <LegalDocumentRow
              key={document.key}
              document={document}
              status={
                byKey.get(document.key) ?? {
                  key: document.key,
                  inForce: document.alwaysInForce,
                  ownDocument: false,
                }
              }
              onError={setError}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
