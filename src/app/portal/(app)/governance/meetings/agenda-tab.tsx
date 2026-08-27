"use client";

import { FormEvent, ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ReadOnlyField } from "@/components/ui/read-only-field";
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
import { useResetOnModeChange, useTabData } from "@/hooks/use-tab-data";

const OPENING_CHECKLIST = [
  "Welcome and call to order",
  "Confirm quorum",
  "Approve previous meeting minutes",
  "Review agenda",
];

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
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
}: {
  agenda: Agenda | null;
  sections: AgendaTemplateSection[];
  templateId: string | null;
  templateVersionId: string | null;
  meetingId: string;
  onSaved: () => void;
  onCancel: () => void;
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
    <form
      onSubmit={handleSubmit}
      className="rounded-md border border-[var(--line)] p-4"
    >
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
              <p className="app-muted text-sm">
                No agenda template is configured.
              </p>
            ) : (
              sections.map((section) => (
                <div
                  key={section.key}
                  className="rounded-md border border-[var(--line)] p-3"
                >
                  <p className="text-sm font-semibold">{section.label}</p>
                  {section.topics.length > 0 && (
                    <ul className="app-muted mt-1 list-disc pl-5 text-sm">
                      {section.topics.map((topic) => (
                        <li key={topic}>{topic}</li>
                      ))}
                    </ul>
                  )}
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
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save agenda"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function AgendaTab({
  meetingId,
  meetingDate,
  active,
  mode,
  onViewActionItems,
  onViewDecisions,
}: {
  meetingId: string;
  meetingDate: string;
  active: boolean;
  mode: "view" | "edit";
  onViewActionItems: () => void;
  onViewDecisions: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const {
    data: agenda,
    loadError,
    refresh: refreshAgenda,
  } = useTabData<Agenda | null>(() => getAgendaAction(meetingId), active, [
    meetingId,
  ]);
  const { data: templates } = useTabData<ActiveAgendaTemplate[]>(
    () => listActiveAgendaTemplatesAction(),
    active,
    [meetingId],
  );
  const { data: carriedOverItems } = useTabData<ActionItem[]>(
    () => listCarriedOverActionItemsAction(meetingId, meetingDate),
    active,
    [meetingId, meetingDate],
  );
  const { data: createdItems } = useTabData<ActionItem[]>(
    () => listActionItemsAction(meetingId),
    active,
    [meetingId],
  );
  const { data: decisions } = useTabData<Decision[]>(
    () => listDecisionsAction(meetingId),
    active,
    [meetingId],
  );

  useResetOnModeChange(mode, () => setEditing(false));

  if (agenda === undefined) {
    return <p className="app-muted text-sm">Loading agenda...</p>;
  }

  const activeTemplate = templates?.[0] ?? null;
  const sections = agenda?.template_sections.length
    ? agenda.template_sections
    : (activeTemplate?.sections ?? []);
  const templateId = agenda?.template_id ?? activeTemplate?.id ?? null;
  const templateVersionId =
    agenda?.template_version_id ?? activeTemplate?.version_id ?? null;

  if (editing) {
    return (
      <AgendaForm
        agenda={agenda}
        sections={sections}
        templateId={templateId}
        templateVersionId={templateVersionId}
        meetingId={meetingId}
        onSaved={() => {
          setEditing(false);
          refreshAgenda();
        }}
        onCancel={() => setEditing(false)}
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
        <div className="flex flex-col gap-3">
          <p className="app-muted text-sm">No agenda added yet.</p>
          {mode === "edit" && (
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                + Add agenda
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div>
            <p className="text-sm font-semibold">Opening</p>
            <ul className="app-muted mt-1 list-disc pl-5 text-sm">
              {OPENING_CHECKLIST.map((item) => (
                <li key={item}>{item}</li>
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
                      — {item.owner?.name ?? "—"}
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
                <p className="app-muted text-sm">
                  No agenda template is configured.
                </p>
              ) : (
                sections.map((section) => {
                  const value = agenda.ongoing_items[section.key];
                  return (
                    <div
                      key={section.key}
                      className="rounded-md border border-[var(--line)] p-3"
                    >
                      <p className="text-sm font-semibold">{section.label}</p>
                      {section.topics.length > 0 && (
                        <ul className="app-muted mt-1 list-disc pl-5 text-sm">
                          {section.topics.map((topic) => (
                            <li key={topic}>{topic}</li>
                          ))}
                        </ul>
                      )}
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
              <p className="app-muted text-sm">No decisions recorded yet.</p>
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
                        {item.date ? formatDate(item.date) : "—"}
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
                      — {item.owner?.name ?? "—"}
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
              {agenda.next_meeting_date
                ? formatDate(agenda.next_meeting_date)
                : "—"}
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

      {agenda && mode === "edit" && (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Edit agenda"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        </div>
      )}
    </div>
  );
}
