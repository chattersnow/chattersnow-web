import { describe, expect, test } from "bun:test";
import { renderTaskDigest } from "./task-digest-email";
import type { DigestRecipient } from "./task-digest";

const SITE = "https://chattersnow.org";
const MEETING = {
  key: "meeting:meeting-9",
  label: "Board meeting, Feb 19, 2026",
};
const EVENT = { key: "event:event-3", label: "Winter Social, Jan 10, 2027" };

function recipient(overrides: Partial<DigestRecipient> = {}): DigestRecipient {
  return {
    tenantId: "tenant-1",
    personId: "person-1",
    email: "avery@example.test",
    name: "Avery",
    items: [
      {
        key: "action_item:item-1",
        kind: "action_item",
        title: "Send the insurance certificate",
        dueDate: "2026-03-01",
        group: MEETING,
        href: "/portal/governance/meetings/meeting-9?tab=overview#action-items-section",
        severity: "urgent",
      },
      {
        key: "action_item:item-2",
        kind: "action_item",
        title: "Book the lodge for the spring session",
        dueDate: "2026-03-14",
        group: MEETING,
        href: "/portal/governance/meetings/meeting-9?tab=overview#action-items-section",
        severity: "attention",
      },
    ],
    ...overrides,
  };
}

describe("renderTaskDigest subject", () => {
  test("counts the items and calls out the overdue ones", () => {
    expect(renderTaskDigest(recipient(), SITE).subject).toBe(
      "2 tasks need your attention (1 overdue)",
    );
  });

  test("drops the overdue clause when nothing is late", () => {
    const one = recipient();
    one.items = [{ ...one.items[1] }];
    expect(renderTaskDigest(one, SITE).subject).toBe(
      "1 task needs your attention",
    );
  });
});

describe("renderTaskDigest bodies", () => {
  test("lists every item in both parts", () => {
    const { text, html } = renderTaskDigest(recipient(), SITE);
    for (const body of [text, html]) {
      expect(body).toContain("Send the insurance certificate");
      expect(body).toContain("Book the lodge for the spring session");
    }
  });

  test("says what is overdue rather than leaving the reader to work it out", () => {
    const { text } = renderTaskDigest(recipient(), SITE);
    expect(text).toContain("Overdue — was due Mar 1, 2026");
    expect(text).toContain("Due Mar 14, 2026");
  });

  test("labels an undated item plainly", () => {
    const undated = recipient();
    undated.items = [
      { ...undated.items[0], dueDate: null, severity: "attention" },
    ];
    expect(renderTaskDigest(undated, SITE).text).toContain("No due date");
  });

  test("links each item absolutely, at the meeting's action items", () => {
    const { text, html } = renderTaskDigest(recipient(), SITE);
    const expected =
      "https://chattersnow.org/portal/governance/meetings/meeting-9?tab=overview#action-items-section";
    expect(text).toContain(expected);
    expect(html).toContain(expected);
  });

  test("points at the account page so the reader can turn this off", () => {
    const { text, html } = renderTaskDigest(recipient(), SITE);
    expect(text).toContain("https://chattersnow.org/portal/account");
    expect(html).toContain("https://chattersnow.org/portal/account");
  });

  test("does not double the slash when the site url has a trailing one", () => {
    const { text } = renderTaskDigest(recipient(), "https://chattersnow.org/");
    expect(text).not.toContain("//portal");
  });

  test("lists items under their meeting or event, most pressing group first", () => {
    const mixed = recipient();
    mixed.items = [
      mixed.items[0],
      {
        key: "checklist:item-3",
        kind: "checklist",
        title: "Print sign-in sheets",
        dueDate: "2026-03-05",
        group: EVENT,
        href: "/portal/events/event-3?tab=checklist",
        severity: "attention",
      },
      mixed.items[1],
    ];
    const { text, html } = renderTaskDigest(mixed, SITE);

    const order = (body: string) =>
      [
        MEETING.label,
        "Send the insurance certificate",
        "Book the lodge for the spring session",
        EVENT.label,
        "Print sign-in sheets",
      ].map((needle) => body.indexOf(needle));
    for (const body of [text, html]) {
      const positions = order(body);
      expect(positions.every((at) => at >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    }
    // One heading per group, however many items sit under it.
    expect(text.split(MEETING.label)).toHaveLength(2);
    expect(text).toContain(
      "https://chattersnow.org/portal/events/event-3?tab=checklist",
    );
  });

  test("escapes a group label that contains markup", () => {
    const hostile = recipient();
    hostile.items = [
      {
        ...hostile.items[0],
        group: { key: "event:x", label: "<b>Gala</b>" },
      },
    ];
    expect(renderTaskDigest(hostile, SITE).html).toContain(
      "&lt;b&gt;Gala&lt;/b&gt;",
    );
  });

  test("greets by name, and without one when there is none", () => {
    expect(renderTaskDigest(recipient(), SITE).text).toStartWith("Hi Avery,");
    expect(renderTaskDigest(recipient({ name: null }), SITE).text).toStartWith(
      "Hi,",
    );
  });

  test("escapes a description that contains markup", () => {
    // Descriptions are typed into the portal by people, so they are untrusted
    // text by the time they reach an HTML body.
    const hostile = recipient();
    hostile.items = [
      { ...hostile.items[0], title: '<img src=x onerror="alert(1)">' },
    ];
    const { html } = renderTaskDigest(hostile, SITE);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
