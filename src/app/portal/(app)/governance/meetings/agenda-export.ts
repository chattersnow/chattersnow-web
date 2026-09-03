import type { Agenda } from "./agenda-actions";
import type { AgendaTemplateSection } from "./agenda-template-shared";
import type { ActionItem } from "./action-items-actions";
import type { Decision } from "./decisions-actions";
import {
  formatCalendarDate,
  formatInstantDate,
  personDisplayName,
} from "@/lib/format";

export type AgendaExportInput = {
  meetingDate: string;
  agenda: Agenda;
  sections: AgendaTemplateSection[];
  openingChecklist: string[];
  carriedOverItems: ActionItem[];
  createdItems: ActionItem[];
  decisions: Decision[];
};

function actionItemLine(item: ActionItem): string {
  return `${item.description} — ${personDisplayName(item.owner)}`;
}

function decisionLine(decision: Decision): string {
  const topic = decision.topic ? `${decision.topic}: ` : "";
  const vote = decision.vote_result ? ` (${decision.vote_result})` : "";
  return `${topic}${decision.description}${vote}`;
}

export function formatAgendaMarkdown(input: AgendaExportInput): string {
  const { agenda, sections, openingChecklist } = input;
  const lines: string[] = [];

  lines.push(`# Agenda — ${formatInstantDate(input.meetingDate)}`);
  lines.push("");

  if (agenda.external_link) {
    lines.push(`External link: ${agenda.external_link}`);
    lines.push("");
  }

  lines.push("## Opening");
  for (const step of openingChecklist) lines.push(`- ${step}`);
  lines.push("");

  lines.push("## Action items from previous meeting");
  if (input.carriedOverItems.length === 0) {
    lines.push("None carried over.");
  } else {
    for (const item of input.carriedOverItems)
      lines.push(`- ${actionItemLine(item)}`);
  }
  lines.push("");

  lines.push("## Ongoing board items");
  if (sections.length === 0) {
    lines.push("No agenda template is configured.");
  } else {
    for (const section of sections) {
      const value = agenda.ongoing_items[section.key];
      lines.push(`### ${section.label}`);
      lines.push(`**Updates:** ${value?.updates || "—"}`);
      lines.push(`**Decisions needed:** ${value?.decisions_needed || "—"}`);
      lines.push("");
    }
  }

  lines.push("## Decisions & votes");
  if (input.decisions.length === 0) {
    lines.push("No decisions recorded yet.");
  } else {
    for (const decision of input.decisions)
      lines.push(`- ${decisionLine(decision)}`);
  }
  lines.push("");

  lines.push("## New business");
  if (agenda.new_business.length === 0) {
    lines.push("None.");
  } else {
    for (const item of agenda.new_business) lines.push(`- ${item}`);
  }
  lines.push("");

  lines.push("## Upcoming dates");
  if (agenda.upcoming_dates.length === 0) {
    lines.push("None scheduled.");
  } else {
    for (const item of agenda.upcoming_dates) {
      const date = formatCalendarDate(item.date);
      lines.push(
        `- ${date} — ${item.description || "—"} (${item.owner || "—"})`,
      );
    }
  }
  lines.push("");

  lines.push("## Action items created today");
  if (input.createdItems.length === 0) {
    lines.push("None yet.");
  } else {
    for (const item of input.createdItems)
      lines.push(`- ${actionItemLine(item)}`);
  }
  lines.push("");

  lines.push("## Parking lot");
  if (agenda.parking_lot.length === 0) {
    lines.push("None.");
  } else {
    for (const item of agenda.parking_lot) lines.push(`- ${item}`);
  }
  lines.push("");

  lines.push("## Next meeting");
  const nextMeeting = formatCalendarDate(agenda.next_meeting_date);
  lines.push(
    agenda.next_meeting_topics
      ? `${nextMeeting} — ${agenda.next_meeting_topics}`
      : nextMeeting,
  );
  lines.push("");

  lines.push("## Meeting notes");
  lines.push(agenda.body_text || "—");

  return lines.join("\n");
}

export function formatAgendaPlainText(input: AgendaExportInput): string {
  const { agenda, sections, openingChecklist } = input;
  const lines: string[] = [];

  lines.push(`AGENDA — ${formatInstantDate(input.meetingDate)}`);
  lines.push("");

  if (agenda.external_link) {
    lines.push(`External link: ${agenda.external_link}`);
    lines.push("");
  }

  lines.push("OPENING");
  for (const step of openingChecklist) lines.push(`  - ${step}`);
  lines.push("");

  lines.push("ACTION ITEMS FROM PREVIOUS MEETING");
  if (input.carriedOverItems.length === 0) {
    lines.push("  None carried over.");
  } else {
    for (const item of input.carriedOverItems)
      lines.push(`  - ${actionItemLine(item)}`);
  }
  lines.push("");

  lines.push("ONGOING BOARD ITEMS");
  if (sections.length === 0) {
    lines.push("  No agenda template is configured.");
  } else {
    for (const section of sections) {
      const value = agenda.ongoing_items[section.key];
      lines.push(`  ${section.label}`);
      lines.push(`    Updates: ${value?.updates || "—"}`);
      lines.push(`    Decisions needed: ${value?.decisions_needed || "—"}`);
    }
  }
  lines.push("");

  lines.push("DECISIONS & VOTES");
  if (input.decisions.length === 0) {
    lines.push("  No decisions recorded yet.");
  } else {
    for (const decision of input.decisions)
      lines.push(`  - ${decisionLine(decision)}`);
  }
  lines.push("");

  lines.push("NEW BUSINESS");
  if (agenda.new_business.length === 0) {
    lines.push("  None.");
  } else {
    for (const item of agenda.new_business) lines.push(`  - ${item}`);
  }
  lines.push("");

  lines.push("UPCOMING DATES");
  if (agenda.upcoming_dates.length === 0) {
    lines.push("  None scheduled.");
  } else {
    for (const item of agenda.upcoming_dates) {
      const date = formatCalendarDate(item.date);
      lines.push(
        `  - ${date} — ${item.description || "—"} (${item.owner || "—"})`,
      );
    }
  }
  lines.push("");

  lines.push("ACTION ITEMS CREATED TODAY");
  if (input.createdItems.length === 0) {
    lines.push("  None yet.");
  } else {
    for (const item of input.createdItems)
      lines.push(`  - ${actionItemLine(item)}`);
  }
  lines.push("");

  lines.push("PARKING LOT");
  if (agenda.parking_lot.length === 0) {
    lines.push("  None.");
  } else {
    for (const item of agenda.parking_lot) lines.push(`  - ${item}`);
  }
  lines.push("");

  lines.push("NEXT MEETING");
  const nextMeeting = formatCalendarDate(agenda.next_meeting_date);
  lines.push(
    `  ${
      agenda.next_meeting_topics
        ? `${nextMeeting} — ${agenda.next_meeting_topics}`
        : nextMeeting
    }`,
  );
  lines.push("");

  lines.push("MEETING NOTES");
  lines.push(`  ${agenda.body_text || "—"}`);

  return lines.join("\n");
}
