import { describe, expect, test } from "bun:test";
import { renderTaskDigest } from "./task-digest-email";
import type { DigestRecipient } from "./task-digest";

const SITE = "https://chattersnow.org";

function recipient(overrides: Partial<DigestRecipient> = {}): DigestRecipient {
  return {
    tenantId: "tenant-1",
    personId: "person-1",
    email: "avery@example.test",
    name: "Avery",
    items: [
      {
        id: "item-1",
        description: "Send the insurance certificate",
        dueDate: "2026-03-01",
        meetingId: "meeting-9",
        meetingDate: "2026-02-20T02:00:00Z",
        href: "/portal/governance/meetings/meeting-9?tab=overview#action-items-section",
        severity: "urgent",
      },
      {
        id: "item-2",
        description: "Book the lodge for the spring session",
        dueDate: "2026-03-14",
        meetingId: "meeting-9",
        meetingDate: "2026-02-20T02:00:00Z",
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
      "2 action items need your attention (1 overdue)",
    );
  });

  test("drops the overdue clause when nothing is late", () => {
    const one = recipient();
    one.items = [{ ...one.items[1] }];
    expect(renderTaskDigest(one, SITE).subject).toBe(
      "1 action item needs your attention",
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
      { ...hostile.items[0], description: '<img src=x onerror="alert(1)">' },
    ];
    const { html } = renderTaskDigest(hostile, SITE);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
