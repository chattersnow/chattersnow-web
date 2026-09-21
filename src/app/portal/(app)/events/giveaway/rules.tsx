"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  getGiveawayRulesAction,
  publishGiveawayRulesAction,
  saveGiveawayRulesAction,
  type GiveawayRulesEditorState,
} from "../giveaway-rules-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { runAction } from "@/components/portal/action-toast";
import { useTabData } from "@/hooks/use-tab-data";
import {
  GIVEAWAY_RULES_SECTIONS,
  ODDS_BASES,
  type GiveawayRulesSource,
  type OddsBasis,
} from "@/lib/giveaway-rules";
import { ViewerTime } from "@/components/viewer-time";

/**
 * Official rules for one promotion (#1322).
 *
 * Three layers meet here and the panel's job is to show which is which: the
 * platform's template, the organization's standing answers (Website > Giveaway
 * rules), and this giveaway's own numbers. Every section can be rewritten for
 * this promotion alone, and a rewrite never touches the organization's answer.
 *
 * Publishing freezes the whole document into a version. It is refused while
 * anything is still missing rather than published with a hole in it, and the
 * gaps say what is missing and where to go and fix it.
 */
const SOURCE_LABEL: Record<GiveawayRulesSource, string> = {
  tenant: "From your answers",
  derived: "From this giveaway",
  platform: "Platform wording",
};

export function RulesSection({
  giveawayId,
  canEdit,
  onChanged,
}: {
  giveawayId: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { data, loadError, refresh } = useTabData<GiveawayRulesEditorState>(
    () => getGiveawayRulesAction(giveawayId),
    [giveawayId],
  );

  // Unsaved edits are held as a diff against what the server last said,
  // rather than copied into state and re-synced by an effect: with a copy,
  // every re-read has to decide whether to overwrite what somebody is typing,
  // and the lint rule against setState-in-an-effect is pointing at exactly
  // that hazard. Null means "nothing edited", so a refresh after a save shows
  // the saved document with no reconciliation at all.
  const [edits, setEdits] = useState<{
    oddsBasis: OddsBasis;
    overrides: Record<string, string>;
  } | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isPublishing, startPublishing] = useTransition();

  const savedOverrides = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(data?.overrides ?? {}).map(([id, paragraphs]) => [
          id,
          paragraphs.join("\n\n"),
        ]),
      ),
    [data],
  );

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return <Spinner className="size-4" />;

  const oddsBasis = edits?.oddsBasis ?? data.oddsBasis;
  const overrides = edits?.overrides ?? savedOverrides;
  const dirty = edits !== null;

  function edit(
    next: Partial<{ oddsBasis: OddsBasis; overrides: Record<string, string> }>,
  ) {
    setEdits((previous) => ({
      oddsBasis: next.oddsBasis ?? previous?.oddsBasis ?? oddsBasis,
      overrides: next.overrides ?? previous?.overrides ?? overrides,
    }));
  }

  function handleSave() {
    startSaving(async () => {
      await runAction(
        () =>
          saveGiveawayRulesAction(giveawayId, {
            oddsBasis,
            overrides: Object.fromEntries(
              Object.entries(overrides).map(([id, text]) => [
                id,
                text.split(/\n{2,}/).map((paragraph) => paragraph.trim()),
              ]),
            ),
          }),
        {
          success: "Saved. Publish when you are ready to serve them.",
          error: "Could not save these rules. Please try again.",
          onSuccess: () => {
            setEdits(null);
            refresh();
            onChanged();
          },
        },
      );
    });
  }

  function handlePublish() {
    startPublishing(async () => {
      await runAction(() => publishGiveawayRulesAction(giveawayId), {
        success: "Published. These rules are now served, and frozen.",
        error: "Could not publish these rules. Please try again.",
        onSuccess: () => {
          setEdits(null);
          refresh();
          onChanged();
        },
      });
    });
  }

  const current = data.versions[0];
  const ready = data.gaps.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <PublicationState versions={data.versions} publicPath={data.publicPath} />

      {data.gaps.length > 0 && (
        <Alert>
          <AlertDescription>
            <p className="font-medium">
              Not ready to publish. {data.gaps.length}{" "}
              {data.gaps.length === 1 ? "section is" : "sections are"} still
              missing something:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {data.gaps.map((gap) => (
                <li key={gap.sectionId}>
                  <span className="font-medium">{gap.sectionTitle}</span> —{" "}
                  {gap.missing}
                </li>
              ))}
            </ul>
            {data.unanswered.length > 0 && (
              <p className="mt-2">
                The questions your organization answers once are in{" "}
                <Link
                  href="/portal/website/giveaway-rules"
                  className="underline underline-offset-4"
                >
                  Website &rsaquo; Giveaway rules
                </Link>
                . Anything you would rather write for this promotion alone can
                be written below instead.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="odds-basis" className="text-sm font-medium">
          How the odds are stated
        </label>
        <Select
          value={oddsBasis}
          onValueChange={(next) => edit({ oddsBasis: next as OddsBasis })}
          disabled={!canEdit}
        >
          <SelectTrigger id="odds-basis" className="sm:w-96">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ODDS_BASES.map((basis) => (
              <SelectItem key={basis.value} value={basis.value}>
                {basis.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="app-muted text-sm">
          {ODDS_BASES.find((basis) => basis.value === oddsBasis)?.description}
        </p>
      </div>

      <div className="divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
        {GIVEAWAY_RULES_SECTIONS.map((section) => {
          const template = data.template[section.id] ?? [];
          const override = overrides[section.id] ?? "";
          const gap = data.gaps.find((entry) => entry.sectionId === section.id);
          return (
            <div key={section.id} className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-medium">{section.title}</h4>
                <Badge variant="outline">{SOURCE_LABEL[section.source]}</Badge>
                {override.trim() && <Badge>Rewritten here</Badge>}
              </div>
              <p className="app-muted text-sm">{section.guidance}</p>

              {override.trim() ? null : template.length ? (
                <div className="app-muted rounded-md bg-accent/40 p-3 text-sm whitespace-pre-line">
                  {template.join("\n\n")}
                </div>
              ) : (
                <p className="text-sm text-destructive">
                  {gap?.missing ?? "Nothing to publish here yet."}
                </p>
              )}

              {canEdit && (
                <div className="flex flex-col gap-2">
                  <Textarea
                    aria-label={`Rewrite “${section.title}” for this promotion`}
                    value={override}
                    rows={override ? 6 : 2}
                    placeholder="Leave blank to publish the wording above. Anything typed here replaces it, for this promotion only."
                    onChange={(event) =>
                      edit({
                        overrides: {
                          ...overrides,
                          [section.id]: event.target.value,
                        },
                      })
                    }
                  />
                  {override.trim() && (
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          edit({
                            overrides: { ...overrides, [section.id]: "" },
                          })
                        }
                      >
                        Put the standard wording back
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            Save changes
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handlePublish}
            disabled={!ready || dirty || isPublishing}
          >
            {current ? "Publish a new version" : "Publish these rules"}
          </Button>
          {(isSaving || isPublishing) && <Spinner className="size-4" />}
          {dirty && (
            <span className="app-muted text-sm">
              Save before publishing — a publish freezes what is saved.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PublicationState({
  versions,
  publicPath,
}: {
  versions: GiveawayRulesEditorState["versions"];
  publicPath: string;
}) {
  const current = versions[0];

  if (!current) {
    return (
      <p className="app-muted text-sm">
        Nothing is published. This promotion has no public rules page until
        somebody publishes one, and nothing below is served in the meantime.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        <span className="font-medium">Version {current.version}</span> is in
        force, effective{" "}
        <ViewerTime iso={current.effective_at} fallbackZone="UTC" />.{" "}
        <Link
          href={publicPath}
          className="underline underline-offset-4"
          target="_blank"
          rel="noreferrer"
        >
          View the published rules
        </Link>
      </p>
      <p className="app-muted">
        Published rules are frozen: their dates, prize values and odds stay as
        they were.{" "}
        {versions.length > 1
          ? `${versions.length} versions have been published, and each stays readable at its own address.`
          : `Publishing again creates version ${current.version + 1} with its own effective date, and version ${current.version} stays readable.`}
      </p>
    </div>
  );
}
