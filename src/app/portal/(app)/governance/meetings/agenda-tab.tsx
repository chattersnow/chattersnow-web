"use client";

import {
  FormEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  getAgendaAction,
  listActiveAgendaTemplatesAction,
  upsertAgendaAction,
  type Agenda,
} from "./agenda-actions";
import type { AgendaOngoingItem, AgendaUpcomingDate } from "./agenda-form";
import type {
  ActiveAgendaTemplate,
  AgendaTemplateSection,
} from "./agenda-template-shared";
import {
  listActionItemsAction,
  listCarriedOverActionItemsAction,
  type ActionItem,
} from "./action-items-actions";
import { listDecisionsAction, type Decision } from "./decisions-actions";
import {
  getPreviousMeetingMinutesAction,
  type PreviousMeetingMinutes,
} from "./minutes-approval-actions";
import { MinutesApprovalDialog } from "./minutes-approval-dialog";
import { TabLoadingSkeleton } from "@/components/portal/tab-loading-skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatedListEditor } from "@/components/dated-list-editor";
import { FreeformListEditor } from "@/components/freeform-list-editor";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useTabData } from "@/hooks/use-tab-data";
import { Spinner } from "@/components/ui/spinner";
import { AgendaExportDialog } from "./agenda-export-dialog";
import { formatCalendarDate, personDisplayName } from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

const APPROVE_MINUTES_ITEM = "Approve previous meeting minutes";

const OPENING_CHECKLIST = [
  "Welcome and call to order",
  "Confirm quorum",
  APPROVE_MINUTES_ITEM,
  "Review agenda",
];

function OngoingTopicsTooltip({ topics }: { topics: string[] }) {
  if (topics.length === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="app-muted mt-1 text-xs underline decoration-dotted underline-offset-2"
          />
        }
      >
        {topics.length} reference topic{topics.length === 1 ? "" : "s"}
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        <ul className="list-disc pl-4">
          {topics.map((topic) => (
            <li key={topic}>{topic}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function ReadOnlySection({
  title,
  onViewAll,
  children,
}: {
  title: string;
  onViewAll?: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {onViewAll && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={onViewAll}
          >
            View all
          </Button>
        )}
      </div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ReadOnlyListSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="app-muted text-sm">None.</p>
      ) : (
        <ul className="app-muted mt-1 list-disc pl-5 text-sm">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AgendaForm({
  agenda,
  sections,
  templateId,
  templateVersionId,
  meetingId,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  agenda: Agenda | null;
  sections: AgendaTemplateSection[];
  templateId: string | null;
  templateVersionId: string | null;
  meetingId: string;
  onSaved: () => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [externalLink, setExternalLink] = useState(agenda?.external_link ?? "");
  const [bodyText, setBodyText] = useState(agenda?.body_text ?? "");
  const [ongoingItems, setOngoingItems] = useState<
    Record<string, AgendaOngoingItem>
  >(agenda?.ongoing_items ?? {});
  const [newBusiness, setNewBusiness] = useState<string[]>(
    agenda?.new_business ?? [],
  );
  const [parkingLot, setParkingLot] = useState<string[]>(
    agenda?.parking_lot ?? [],
  );
  const [upcomingDates, setUpcomingDates] = useState<AgendaUpcomingDate[]>(
    agenda?.upcoming_dates ?? [],
  );
  const [nextMeetingDate, setNextMeetingDate] = useState(
    agenda?.next_meeting_date ?? "",
  );
  const [nextMeetingTopics, setNextMeetingTopics] = useState(
    agenda?.next_meeting_topics ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Captured once on mount so edits can be compared back to the loaded
  // agenda, regardless of later prop changes (e.g. a background refresh).
  const baselineRef = useRef({
    externalLink: agenda?.external_link ?? "",
    bodyText: agenda?.body_text ?? "",
    ongoingItems: agenda?.ongoing_items ?? {},
    newBusiness: agenda?.new_business ?? [],
    parkingLot: agenda?.parking_lot ?? [],
    upcomingDates: agenda?.upcoming_dates ?? [],
    nextMeetingDate: agenda?.next_meeting_date ?? "",
    nextMeetingTopics: agenda?.next_meeting_topics ?? "",
  });

  useEffect(() => {
    const baseline = baselineRef.current;
    const dirty =
      externalLink !== baseline.externalLink ||
      bodyText !== baseline.bodyText ||
      JSON.stringify(ongoingItems) !== JSON.stringify(baseline.ongoingItems) ||
      JSON.stringify(newBusiness) !== JSON.stringify(baseline.newBusiness) ||
      JSON.stringify(parkingLot) !== JSON.stringify(baseline.parkingLot) ||
      JSON.stringify(upcomingDates) !==
        JSON.stringify(baseline.upcomingDates) ||
      nextMeetingDate !== baseline.nextMeetingDate ||
      nextMeetingTopics !== baseline.nextMeetingTopics;
    onDirtyChange?.(dirty);
  }, [
    externalLink,
    bodyText,
    ongoingItems,
    newBusiness,
    parkingLot,
    upcomingDates,
    nextMeetingDate,
    nextMeetingTopics,
    onDirtyChange,
  ]);

  // Reported dirty state belongs to this mounted form only -- clear it when
  // the form goes away (save, cancel, or a forced discard from the parent),
  // so a stale "dirty" flag can't outlive the component that set it.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  function updateOngoingItem(key: string, patch: Partial<AgendaOngoingItem>) {
    setOngoingItems((prev) => ({
      ...prev,
      [key]: {
        updates: prev[key]?.updates ?? "",
        decisions_needed: prev[key]?.decisions_needed ?? "",
        ...patch,
      },
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("externalLink", externalLink);
    formData.set("bodyText", bodyText);
    formData.set("templateId", templateId ?? "");
    formData.set("templateVersionId", templateVersionId ?? "");
    formData.set("ongoingItems", JSON.stringify(ongoingItems));
    formData.set("newBusiness", JSON.stringify(newBusiness));
    formData.set("parkingLot", JSON.stringify(parkingLot));
    formData.set("upcomingDates", JSON.stringify(upcomingDates));
    formData.set("nextMeetingDate", nextMeetingDate);
    formData.set("nextMeetingTopics", nextMeetingTopics);

    startTransition(async () => {
      const result = await upsertAgendaAction(meetingId, formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="agenda-link">External link</FieldLabel>
          <Input
            id="agenda-link"
            type="url"
            placeholder="https://..."
            value={externalLink}
            onChange={(event) => setExternalLink(event.target.value)}
          />
        </Field>

        <div>
          <p className="text-sm font-semibold">Ongoing board items</p>
          <div className="mt-2 flex flex-col gap-3">
            {sections.length === 0 ? (
              <EmptyState
                className="py-4"
                title="No agenda template is configured"
                description="Agenda templates are managed outside the portal; ask an administrator to activate one."
              />
            ) : (
              sections.map((section) => (
                <div
                  key={section.key}
                  className="rounded-md border border-[var(--line)] p-3"
                >
                  <p className="text-sm font-semibold">{section.label}</p>
                  <OngoingTopicsTooltip topics={section.topics} />
                  <div className="mt-3 flex flex-col gap-3">
                    <Field>
                      <FieldLabel htmlFor={`agenda-updates-${section.key}`}>
                        Updates
                      </FieldLabel>
                      <Textarea
                        id={`agenda-updates-${section.key}`}
                        rows={3}
                        value={ongoingItems[section.key]?.updates ?? ""}
                        onChange={(event) =>
                          updateOngoingItem(section.key, {
                            updates: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`agenda-decisions-${section.key}`}>
                        Decisions needed
                      </FieldLabel>
                      <Textarea
                        id={`agenda-decisions-${section.key}`}
                        rows={2}
                        value={
                          ongoingItems[section.key]?.decisions_needed ?? ""
                        }
                        onChange={(event) =>
                          updateOngoingItem(section.key, {
                            decisions_needed: event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <FreeformListEditor
          label="New business"
          items={newBusiness}
          onChange={setNewBusiness}
        />
        <FreeformListEditor
          label="Parking lot"
          items={parkingLot}
          onChange={setParkingLot}
        />
        <DatedListEditor items={upcomingDates} onChange={setUpcomingDates} />

        <Field orientation="responsive">
          <Field>
            <FieldLabel htmlFor="agenda-next-meeting-date">
              Next meeting date
            </FieldLabel>
            <Input
              id="agenda-next-meeting-date"
              type="date"
              value={nextMeetingDate}
              onChange={(event) => setNextMeetingDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="agenda-next-meeting-topics">
              Primary topics
            </FieldLabel>
            <Input
              id="agenda-next-meeting-topics"
              value={nextMeetingTopics}
              onChange={(event) => setNextMeetingTopics(event.target.value)}
            />
          </Field>
        </Field>

        <Field>
          <FieldLabel htmlFor="agenda-body">Meeting notes</FieldLabel>
          <Textarea
            id="agenda-body"
            rows={6}
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
          />
        </Field>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Spinner /> Saving...
              </>
            ) : (
              "Save agenda"
            )}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function AgendaTab({
  meetingId,
  meetingDate,
  mode,
  canManage,
  minutesApprovedAt,
  onViewActionItems,
  onViewDecisions,
  onExitEdit,
  onDirtyChange,
}: {
  meetingId: string;
  meetingDate: string;
  mode: "view" | "edit";
  canManage: boolean;
  minutesApprovedAt: string | null;
  onViewActionItems: () => void;
  onViewDecisions: () => void;
  onExitEdit: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const {
    data: agenda,
    loadError,
    refresh: refreshAgenda,
  } = useTabData<Agenda | null>(() => getAgendaAction(meetingId), [meetingId]);
  const { data: templates } = useTabData<ActiveAgendaTemplate[]>(
    () => listActiveAgendaTemplatesAction(),
    [meetingId],
  );
  const { data: carriedOverItems } = useTabData<ActionItem[]>(
    () => listCarriedOverActionItemsAction(meetingId, meetingDate),
    [meetingId, meetingDate],
  );
  const { data: createdItems } = useTabData<ActionItem[]>(
    () => listActionItemsAction(meetingId),
    [meetingId],
  );
  const { data: decisions } = useTabData<Decision[]>(
    () => listDecisionsAction(meetingId),
    [meetingId],
  );
  const { data: previousMinutes } = useTabData<PreviousMeetingMinutes | null>(
    () => getPreviousMeetingMinutesAction(meetingId, meetingDate),
    [meetingId, meetingDate],
  );

  if (agenda === undefined) {
    return <TabLoadingSkeleton />;
  }

  const activeTemplate = templates?.[0] ?? null;
  const sections = agenda?.template_sections.length
    ? agenda.template_sections
    : (activeTemplate?.sections ?? []);
  const templateId = agenda?.template_id ?? activeTemplate?.id ?? null;
  const templateVersionId =
    agenda?.template_version_id ?? activeTemplate?.version_id ?? null;

  if (mode === "edit") {
    return (
      <AgendaForm
        agenda={agenda}
        sections={sections}
        templateId={templateId}
        templateVersionId={templateVersionId}
        meetingId={meetingId}
        onSaved={() => {
          onExitEdit();
          refreshAgenda();
        }}
        onCancel={onExitEdit}
        onDirtyChange={onDirtyChange}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {!agenda ? (
        <EmptyState
          title="No agenda added yet"
          description={
            canManage
              ? "Write it with the Edit agenda (pencil) button above; it starts from the active agenda template."
              : "The agenda appears here once a governance manager writes it."
          }
        />
      ) : (
        <>
          <div className="flex justify-end">
            <AgendaExportDialog
              input={{
                meetingDate,
                agenda,
                sections,
                openingChecklist: OPENING_CHECKLIST,
                carriedOverItems: carriedOverItems ?? [],
                createdItems: createdItems ?? [],
                decisions: decisions ?? [],
              }}
            />
          </div>

          <div>
            <p className="text-sm font-semibold">Opening</p>
            <ul className="app-muted mt-1 list-disc pl-5 text-sm">
              {OPENING_CHECKLIST.map((item) => (
                <li key={item}>
                  {item === APPROVE_MINUTES_ITEM && previousMinutes ? (
                    <MinutesApprovalDialog
                      meetingId={meetingId}
                      previousMeeting={previousMinutes}
                      approvedAt={minutesApprovedAt}
                      canApprove={canManage}
                      onApproved={() => router.refresh()}
                    />
                  ) : (
                    item
                  )}
                </li>
              ))}
            </ul>
          </div>

          <FieldGroup>
            <ReadOnlyField label="External link" htmlFor="agenda-link-view">
              {agenda.external_link ? (
                <a
                  href={agenda.external_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--purple-deep)] underline"
                >
                  {agenda.external_link}
                </a>
              ) : (
                "—"
              )}
            </ReadOnlyField>
          </FieldGroup>

          <ReadOnlySection
            title="Action items from previous meeting"
            onViewAll={onViewActionItems}
          >
            {(carriedOverItems ?? []).length === 0 ? (
              <p className="app-muted text-sm">None carried over.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {(carriedOverItems ?? []).map((item) => (
                  <li key={item.id}>
                    {item.description}
                    <span className="app-muted">
                      {" "}
                      — {personDisplayName(item.owner)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ReadOnlySection>

          <div>
            <p className="text-sm font-semibold">Ongoing board items</p>
            <div className="mt-2 flex flex-col gap-3">
              {sections.length === 0 ? (
                <EmptyState
                  className="py-4"
                  title="No agenda template is configured"
                  description="Agenda templates are managed outside the portal; ask an administrator to activate one."
                />
              ) : (
                sections.map((section) => {
                  const value = agenda.ongoing_items[section.key];
                  return (
                    <div
                      key={section.key}
                      className="rounded-md border border-[var(--line)] p-3"
                    >
                      <p className="text-sm font-semibold">{section.label}</p>
                      <OngoingTopicsTooltip topics={section.topics} />
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <p className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
                            Updates
                          </p>
                          <p className="whitespace-pre-wrap text-sm">
                            {value?.updates || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="app-muted text-xs font-semibold uppercase tracking-[0.1em]">
                            Decisions needed
                          </p>
                          <p className="whitespace-pre-wrap text-sm">
                            {value?.decisions_needed || "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <ReadOnlySection
            title="Decisions & votes"
            onViewAll={onViewDecisions}
          >
            {(decisions ?? []).length === 0 ? (
              <EmptyState
                className="py-4"
                title="No decisions recorded yet"
                description="Record them in the Decisions section of the Overview tab and they will be listed here."
              />
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {(decisions ?? []).map((decision) => (
                  <li key={decision.id}>
                    {decision.topic && (
                      <span className="font-medium">{decision.topic}: </span>
                    )}
                    {decision.description}
                    {decision.vote_result && (
                      <span className="app-muted">
                        {" "}
                        ({decision.vote_result})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ReadOnlySection>

          <ReadOnlyListSection
            title="New business"
            items={agenda.new_business}
          />

          <div>
            <p className="text-sm font-semibold">Upcoming dates</p>
            {agenda.upcoming_dates.length === 0 ? (
              <p className="app-muted text-sm">None scheduled.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Event / deadline</TableHead>
                    <TableHead>Owner</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agenda.upcoming_dates.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="app-muted">
                        {formatCalendarDate(item.date)}
                      </TableCell>
                      <TableCell>{item.description || "—"}</TableCell>
                      <TableCell className="app-muted">
                        {item.owner || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <ReadOnlySection
            title="Action items created today"
            onViewAll={onViewActionItems}
          >
            {(createdItems ?? []).length === 0 ? (
              <p className="app-muted text-sm">None yet.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {(createdItems ?? []).map((item) => (
                  <li key={item.id}>
                    {item.description}
                    <span className="app-muted">
                      {" "}
                      — {personDisplayName(item.owner)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ReadOnlySection>

          <ReadOnlyListSection title="Parking lot" items={agenda.parking_lot} />

          <div>
            <p className="text-sm font-semibold">Next meeting</p>
            <p className="app-muted text-sm">
              {formatCalendarDate(agenda.next_meeting_date)}
              {agenda.next_meeting_topics
                ? ` — ${agenda.next_meeting_topics}`
                : ""}
            </p>
          </div>

          <FieldGroup>
            <ReadOnlyField label="Meeting notes" htmlFor="agenda-body-view">
              <span className="whitespace-pre-wrap">
                {agenda.body_text || "—"}
              </span>
            </ReadOnlyField>
          </FieldGroup>
        </>
      )}
    </div>
  );
}
