"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  formatAgendaMarkdown,
  formatAgendaPlainText,
  type AgendaExportInput,
} from "./agenda-export";
import {
  formatCalendarDate,
  formatInstantDate,
  personDisplayName,
} from "@/lib/format";
import { EmptyState } from "@/components/portal/empty-state";

function CopyButton({
  label,
  getText,
}: {
  label: string;
  getText: () => string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(getText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="secondary" onClick={handleCopy}>
      {copied ? "Copied!" : label}
    </Button>
  );
}

/**
 * Print output is scoped to just this view via the `.agenda-print-area`
 * rule in globals.css (visibility trick), so the rest of the app chrome
 * (nav, dialog overlay, etc.) is left out of the printed page.
 */
function AgendaPrintView({ input }: { input: AgendaExportInput }) {
  const { agenda, sections, openingChecklist } = input;

  return (
    <div className="agenda-print-area max-h-[50vh] overflow-y-auto rounded-md border border-[var(--line)] p-4 text-sm">
      <h1 className="text-lg font-semibold">
        Agenda — {formatInstantDate(input.meetingDate)}
      </h1>
      {agenda.external_link && (
        <p className="mt-1">
          External link:{" "}
          <a href={agenda.external_link} className="underline">
            {agenda.external_link}
          </a>
        </p>
      )}

      <h2 className="mt-4 font-semibold">Opening</h2>
      <ul className="list-disc pl-5">
        {openingChecklist.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>

      <h2 className="mt-4 font-semibold">Action items from previous meeting</h2>
      {input.carriedOverItems.length === 0 ? (
        <p>None carried over.</p>
      ) : (
        <ul className="list-disc pl-5">
          {input.carriedOverItems.map((item) => (
            <li key={item.id}>
              {item.description} — {personDisplayName(item.owner)}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-4 font-semibold">Ongoing board items</h2>
      {sections.length === 0 ? (
        <p>No agenda template is configured.</p>
      ) : (
        sections.map((section) => {
          const value = agenda.ongoing_items[section.key];
          return (
            <div key={section.key} className="mt-2">
              <h3 className="font-medium">{section.label}</h3>
              <p>
                <span className="font-medium">Updates:</span>{" "}
                {value?.updates || "—"}
              </p>
              <p>
                <span className="font-medium">Decisions needed:</span>{" "}
                {value?.decisions_needed || "—"}
              </p>
            </div>
          );
        })
      )}

      <h2 className="mt-4 font-semibold">Decisions &amp; votes</h2>
      {input.decisions.length === 0 ? (
        <p>No decisions recorded yet.</p>
      ) : (
        <ul className="list-disc pl-5">
          {input.decisions.map((decision) => (
            <li key={decision.id}>
              {decision.topic && (
                <span className="font-medium">{decision.topic}: </span>
              )}
              {decision.description}
              {decision.vote_result && <span> ({decision.vote_result})</span>}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-4 font-semibold">New business</h2>
      {agenda.new_business.length === 0 ? (
        <p>None.</p>
      ) : (
        <ul className="list-disc pl-5">
          {agenda.new_business.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}

      <h2 className="mt-4 font-semibold">Upcoming dates</h2>
      {agenda.upcoming_dates.length === 0 ? (
        <p>None scheduled.</p>
      ) : (
        <ul className="list-disc pl-5">
          {agenda.upcoming_dates.map((item, index) => (
            <li key={index}>
              {formatCalendarDate(item.date)} — {item.description || "—"} (
              {item.owner || "—"})
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-4 font-semibold">Action items created today</h2>
      {input.createdItems.length === 0 ? (
        <p>None yet.</p>
      ) : (
        <ul className="list-disc pl-5">
          {input.createdItems.map((item) => (
            <li key={item.id}>
              {item.description} — {personDisplayName(item.owner)}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-4 font-semibold">Parking lot</h2>
      {agenda.parking_lot.length === 0 ? (
        <p>None.</p>
      ) : (
        <ul className="list-disc pl-5">
          {agenda.parking_lot.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}

      <h2 className="mt-4 font-semibold">Next meeting</h2>
      <p>
        {formatCalendarDate(agenda.next_meeting_date)}
        {agenda.next_meeting_topics ? ` — ${agenda.next_meeting_topics}` : ""}
      </p>

      <h2 className="mt-4 font-semibold">Meeting notes</h2>
      <p className="whitespace-pre-wrap">{agenda.body_text || "—"}</p>
    </div>
  );
}

export function AgendaExportDialog({ input }: { input: AgendaExportInput }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Download /> Export
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Export agenda</DialogTitle>
          <DialogDescription>
            Print or copy this agenda to share it outside the portal — through
            email, Drive, or wherever the board already relays meeting
            materials.
          </DialogDescription>
        </DialogHeader>

        <AgendaPrintView input={input} />

        <DialogFooter showCloseButton>
          <CopyButton
            label="Copy as Markdown"
            getText={() => formatAgendaMarkdown(input)}
          />
          <CopyButton
            label="Copy as plain text"
            getText={() => formatAgendaPlainText(input)}
          />
          <Button type="button" onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
