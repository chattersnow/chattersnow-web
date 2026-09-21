"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  acknowledgeLegalDocumentAction,
  updateLegalPublicationAction,
} from "./settings-actions";
import type { SettingActionResult } from "@/lib/settings/write-app-setting";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
// Type-only where the module has server helpers: @/lib/legal-documents is the
// registry and is free of them, but the read lives in @/lib/legal-publication,
// which must not reach the client bundle. State arrives as props from the
// server page, same as PageVisibilityPanel.
import type { LegalDocument } from "@/lib/legal-documents";
// Free of server helpers on purpose, so the drift sentence is written where it
// is tested rather than assembled in JSX.
import {
  hasDrifted,
  joinPhrases,
  namedSurfaces,
  type LegalDocumentDrift,
} from "@/lib/legal-surface";
// Same reasoning: the registry and the words are client-safe, the reads are
// not. The resolved state arrives as a prop.
import {
  needsAcknowledgement,
  type LegalAcknowledgement,
} from "@/lib/legal-acknowledgement";
import { formatInstantDate } from "@/lib/format";
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
  /**
   * Whether the text still describes what the site collects (#1292). Computed
   * on the server and arriving as a prop, like everything else on this type:
   * `@/lib/legal-publication` must not reach the client bundle. Undefined where
   * the question does not arise -- the platform's document is being served, or
   * nothing is.
   */
  drift?: LegalDocumentDrift;
  /**
   * Whether anybody here has confirmed they have read the platform's text for
   * this document, and whether the platform has changed it since (#1321).
   * Undefined where the question does not arise -- the tenant serves its own
   * text, or serves nothing. The exact complement of `drift` above: a document
   * in force carries one or the other, never both.
   */
  acknowledgement?: LegalAcknowledgement;
};

/**
 * The drift line, when there is one (#1292).
 *
 * Deliberately a sentence rather than a badge, and `app-muted` rather than an
 * alert: nothing is broken, the organization's lawyer may well have signed the
 * text off, and the only thing the platform is entitled to do is say what it
 * noticed. It never blocks a publish and never edits the document.
 */
function DriftLine({
  document,
  drift,
}: {
  document: LegalDocument;
  drift: LegalDocumentDrift;
}) {
  if (drift.status === "unknown") {
    return (
      <>
        Published before we started recording what a document covers, so we
        cannot tell whether it still matches your site. Re-publish it from Pages
        to start tracking.
      </>
    );
  }

  const added = namedSurfaces(drift.added, "subject");
  const removed = namedSurfaces(drift.removed, "subject");
  if (added.length === 0 && removed.length === 0) return null;

  // The date leads, so that "since" in the clauses after it has something to
  // refer back to and neither clause has to repeat it.
  const on = formatInstantDate(drift.publishedAt, "");

  return (
    <>
      You published your {document.label.toLowerCase()}
      {on ? ` on ${on}` : ""}.{" "}
      {added.length > 0 ? (
        <>
          <span className="font-medium">{joinPhrases(added)}</span>{" "}
          {added.length === 1 ? "has" : "have"} been turned on since, and your
          text does not describe{" "}
          {joinPhrases(namedSurfaces(drift.added, "collects"))}.{" "}
        </>
      ) : null}
      {removed.length > 0 ? (
        <>
          <span className="font-medium">{joinPhrases(removed)}</span>{" "}
          {removed.length === 1 ? "has" : "have"} been turned off since, and
          your text still describes{" "}
          {joinPhrases(namedSurfaces(drift.removed, "collects"))}.{" "}
        </>
      ) : null}
      Nothing is broken and nothing has been changed for you &mdash; review the
      wording in Pages when you next can.
    </>
  );
}

/**
 * The confirmation line, for a document served from the platform's text
 * (#1321).
 *
 * All three states are said out loud, including the settled one: the whole
 * point of the row is that an organization can answer "when did we last read
 * our own privacy policy, and who", and a record that only appears when
 * something is wrong cannot answer it. `app-muted` throughout, and no alert --
 * nothing here is broken, and the page stays served whatever this says.
 */
function AcknowledgementLine({
  document,
  acknowledgement,
}: {
  document: LegalDocument;
  acknowledgement: LegalAcknowledgement;
}) {
  const label = document.label.toLowerCase();

  if (acknowledgement.status === "never") {
    return (
      <>
        Your {label} is the platform&rsquo;s neutral default. Nobody here has
        confirmed they have read it.
      </>
    );
  }

  const { confirmed } = acknowledgement;
  const on = formatInstantDate(confirmed.acknowledgedAt, "");
  // A record written before anybody had a people row, or by a service-role
  // script: the date is still the answer, and "confirmed by nobody" would be
  // worse than not naming anyone.
  const by = confirmed.personName ? ` by ${confirmed.personName}` : "";
  const when = on ? ` on ${on}` : "";

  if (acknowledgement.status === "stale") {
    return (
      <>
        The platform updated this text on{" "}
        <span className="font-medium">{acknowledgement.updatedTo}</span>. It was
        last confirmed here{by}
        {when}, against the earlier version.
      </>
    );
  }

  return (
    <>
      Confirmed here{by}
      {when}, against the text the platform published on{" "}
      {confirmed.platformLastUpdated}.
    </>
  );
}

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
  const [isConfirming, startConfirming] = useTransition();
  // Held in force only matters while it *is* in force: a document nothing has
  // adopted yet has nothing depending on it, and the module that would depend
  // on it cannot be turned on until it is.
  const held = status.inForce ? status.heldInForceBy : undefined;
  // A fingerprint that matches is the ordinary case and says nothing: the line
  // exists for the two states worth reading, drifted and never recorded.
  const drift =
    status.drift &&
    (status.drift.status === "unknown" || hasDrifted(status.drift))
      ? status.drift
      : undefined;

  function handleConfirm() {
    onError(null);

    startConfirming(async () => {
      await runAction<SettingActionResult>(
        () => acknowledgeLegalDocumentAction(document.key),
        {
          success: `Recorded that you have read the ${document.label.toLowerCase()}.`,
          onError,
          onSuccess: () => router.refresh(),
        },
      );
    });
  }

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
        {drift ? (
          <p className="app-muted mt-1 text-sm leading-relaxed">
            <DriftLine document={document} drift={drift} />
          </p>
        ) : null}
        {status.acknowledgement ? (
          <p className="app-muted mt-1 text-sm leading-relaxed">
            <AcknowledgementLine
              document={document}
              acknowledgement={status.acknowledgement}
            />
          </p>
        ) : null}
        {/* Beside the sentence rather than in the control column on the right,
            where the privacy policy has no switch to sit under and the other
            two have one that means something else entirely. */}
        {needsAcknowledgement(status.acknowledgement) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={handleConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? <Spinner className="size-3.5" /> : null}I have read
            this
          </Button>
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
