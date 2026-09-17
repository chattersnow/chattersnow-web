import { describe, expect, test } from "bun:test";
import {
  formatMinutesMarkdown,
  formatMinutesPlainText,
  type MinutesExportInput,
} from "./minutes-export";
import type { MinutesRow } from "./minutes-core";
import type { ActionItem } from "./action-items-actions";

function minutes(overrides: Partial<MinutesRow> = {}): MinutesRow {
  return {
    id: "minutes-1",
    meeting_id: "meeting-1",
    agenda_snapshot: {
      version: 1,
      meeting_date: "2026-09-01",
      template_id: null,
      template_version_id: null,
      external_link: null,
      items: [
        { key: "opening", label: "Opening", kind: "opening" },
        {
          key: "section:finance",
          label: "Finance & Fundraising",
          kind: "section",
        },
      ],
    },
    notes: {},
    body_text: null,
    status: "draft",
    finalized_at: null,
    finalized_by: null,
    approved_at: null,
    approved_by: null,
    approved_at_meeting_id: null,
    updated_at: "2026-09-01T18:00:00.000Z",
    ...overrides,
  };
}

function actionItem(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: "a1",
    meeting_id: "meeting-1",
    description: "Order supplies",
    due_date: null,
    status: "open",
    minutes_item_key: null,
    owner: {
      id: "p1",
      name: "Alex",
      email: null,
      phone: null,
    },
    ...overrides,
  };
}

const emptyInput: MinutesExportInput = {
  meetingDate: "2026-09-01T18:00:00.000Z",
  minutes: minutes(),
  actionItems: [],
};

describe("formatMinutesMarkdown", () => {
  test("walks the frozen snapshot, placeholders and all", () => {
    const markdown = formatMinutesMarkdown(emptyInput);
    expect(markdown).toContain("# Minutes — Sep 1, 2026");
    expect(markdown).toContain("Status: Draft");
    expect(markdown).toContain("## Opening");
    expect(markdown).toContain("## Finance & Fundraising");
    expect(markdown).toContain("No notes recorded.");
    expect(markdown).toContain("## Closing notes");
    expect(markdown).toContain("None.");
  });

  test("includes each item's notes and reports a finalized record as final", () => {
    const markdown = formatMinutesMarkdown({
      ...emptyInput,
      minutes: minutes({
        notes: { opening: "Called to order at 18:02." },
        body_text: "Adjourned at 19:30.",
        status: "final",
        finalized_at: "2026-09-01T19:35:00.000Z",
      }),
    });

    expect(markdown).toContain("Status: Final");
    expect(markdown).toContain("Called to order at 18:02.");
    expect(markdown).toContain("Adjourned at 19:30.");
  });

  test("groups action items under the item they were raised under", () => {
    const markdown = formatMinutesMarkdown({
      ...emptyInput,
      actionItems: [
        actionItem({
          id: "a1",
          description: "Chase the grant report",
          minutes_item_key: "section:finance",
          due_date: "2026-09-15",
        }),
      ],
    });

    const finance = markdown.indexOf("## Finance & Fundraising");
    const raised = markdown.indexOf(
      "- Chase the grant report — Alex (due Sep 15, 2026)",
    );
    const closing = markdown.indexOf("## Closing notes");
    expect(finance).toBeGreaterThan(-1);
    expect(raised).toBeGreaterThan(finance);
    expect(raised).toBeLessThan(closing);
    // The end-of-document heading exists but has nothing under it.
    expect(markdown).toContain("None raised outside the sections above.");
  });

  test("puts an item raised out of band under a heading of its own at the end", () => {
    const markdown = formatMinutesMarkdown({
      ...emptyInput,
      actionItems: [actionItem({ description: "Renew the insurance" })],
    });

    const closing = markdown.indexOf("## Closing notes");
    const heading = markdown.indexOf("## Action items");
    expect(heading).toBeGreaterThan(closing);
    expect(markdown.indexOf("- Renew the insurance — Alex")).toBeGreaterThan(
      heading,
    );
  });

  test("says so rather than rendering an empty document when no agenda was frozen", () => {
    const markdown = formatMinutesMarkdown({
      ...emptyInput,
      minutes: minutes({ agenda_snapshot: null }),
    });
    expect(markdown).toContain("No agenda was frozen into these minutes.");
  });
});

describe("formatMinutesPlainText", () => {
  test("uses plain uppercase headers instead of markdown syntax", () => {
    const text = formatMinutesPlainText({
      ...emptyInput,
      minutes: minutes({ notes: { opening: "Called to order." } }),
      actionItems: [actionItem({ description: "Renew the insurance" })],
    });

    expect(text).toContain("MINUTES — Sep 1, 2026");
    expect(text).toContain("OPENING");
    expect(text).toContain("CLOSING NOTES");
    expect(text).toContain("ACTION ITEMS");
    expect(text).not.toContain("#");
    expect(text).not.toContain("**");
  });
});
