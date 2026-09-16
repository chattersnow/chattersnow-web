import { describe, expect, test } from "bun:test";
import { renderStaffMessageEmail } from "@/lib/notifications/staff-message-email";

const base = {
  orgName: "Chatter Snow",
  recipientName: "Priya",
  subject: "About your gear request",
  body: "The blue one is gone.\n\nWould the grey do?",
};

describe("renderStaffMessageEmail", () => {
  test("uses the staffer's subject exactly as typed", () => {
    expect(renderStaffMessageEmail(base).subject).toBe(
      "About your gear request",
    );
  });

  test("greets by name, and degrades to a bare greeting without one", () => {
    expect(renderStaffMessageEmail(base).text).toStartWith("Hi Priya,");
    expect(
      renderStaffMessageEmail({ ...base, recipientName: "" }).text,
    ).toStartWith("Hi,");
  });

  test("carries the message and the signature in both bodies", () => {
    const { text, html } = renderStaffMessageEmail(base);
    for (const part of [text, html]) {
      expect(part).toContain("The blue one is gone.");
      expect(part).toContain("Would the grey do?");
      expect(part).toContain("Chatter Snow");
    }
  });

  test("keeps the writer's line breaks rather than collapsing them", () => {
    const { text, html } = renderStaffMessageEmail(base);
    expect(text).toContain("The blue one is gone.\n\nWould the grey do?");
    // The HTML keeps the same newlines and asks CSS to honour them, rather
    // than turning typed text into markup.
    expect(html).toContain("white-space: pre-line");
    expect(html).toContain("The blue one is gone.\n\nWould the grey do?");
  });

  test("escapes what the staffer typed instead of rendering it", () => {
    const { html } = renderStaffMessageEmail({
      ...base,
      body: "<script>alert(1)</script> Tom & Jerry's",
      recipientName: "<b>Priya</b>",
      orgName: "Chatter & Snow",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Tom &amp; Jerry&#39;s");
    expect(html).toContain("&lt;b&gt;Priya&lt;/b&gt;");
    expect(html).toContain("Chatter &amp; Snow");
  });

  test("offers no preference link: there is no switch this message obeys", () => {
    const { text, html } = renderStaffMessageEmail(base);
    for (const part of [text, html]) {
      expect(part).not.toContain("/portal/account");
      expect(part).not.toContain("/my");
      expect(part.toLowerCase()).not.toContain("unsubscribe");
      expect(part.toLowerCase()).not.toContain("change what you get");
    }
  });

  test("trims the surrounding whitespace a textarea collects", () => {
    const { text } = renderStaffMessageEmail({
      ...base,
      body: "\n\n  Ready Saturday.  \n\n",
    });
    expect(text).toBe("Hi Priya,\n\nReady Saturday.\n\n— Chatter Snow");
  });
});
