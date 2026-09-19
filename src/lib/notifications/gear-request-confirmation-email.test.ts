import { describe, expect, test } from "bun:test";
import { renderGearRequestConfirmationEmail } from "./gear-request-confirmation-email";
import { autoReplyDefaults } from "@/lib/notifications/auto-replies";
import { requireAutoReplyDefinition } from "@/lib/notifications/auto-reply-email";
import { GEAR_REQUEST_CONFIRMATION_KIND } from "@/lib/notifications/kinds";

const base = {
  orgName: "Chatter Snow",
  requesterName: "Jo Rivera",
  items: ["Burton Custom 158", "Wool beanie"],
  instructions: "",
  paymentMethod: null,
};

describe("renderGearRequestConfirmationEmail", () => {
  test("names the organization in the subject and lists every item in both parts", () => {
    const { subject, text, html } = renderGearRequestConfirmationEmail({
      ...base,
      deliveryMethod: "meetup",
    });
    expect(subject).toBe("We received your request — Chatter Snow");
    for (const part of [text, html]) {
      expect(part).toContain("Jo Rivera");
      expect(part).toContain("Burton Custom 158");
      expect(part).toContain("Wool beanie");
    }
  });

  test("a meetup says someone will be in touch, and carries the tenant's meetup note", () => {
    const { text } = renderGearRequestConfirmationEmail({
      ...base,
      deliveryMethod: "meetup",
      instructions: "We usually hand gear over Saturdays at the trailhead.",
    });
    expect(text).toContain("pick these up in person");
    expect(text).toContain("Saturdays at the trailhead");
    expect(text).not.toContain("postage");
  });

  test("shipping explains the postage quote and names the chosen payment method", () => {
    const { text, html } = renderGearRequestConfirmationEmail({
      ...base,
      deliveryMethod: "shipping",
      instructions: "Allow up to a week once it's paid.",
      paymentMethod: {
        key: "zelle",
        label: "Zelle",
        handle: "pay@chattersnow.example",
        instructions: "Put your name in the memo.",
      },
    });
    for (const part of [text, html]) {
      expect(part).toContain("postage");
      expect(part).toContain("pay by Zelle");
      expect(part).toContain("pay@chattersnow.example");
      expect(part).toContain("Put your name in the memo.");
      expect(part).toContain("Allow up to a week");
    }
  });

  test("escapes what came off the public form", () => {
    const { html } = renderGearRequestConfirmationEmail({
      ...base,
      requesterName: "<script>alert(1)</script>",
      deliveryMethod: "meetup",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("the tenant's own copy (#1234)", () => {
  const definition = requireAutoReplyDefinition(GEAR_REQUEST_CONFIRMATION_KIND);
  const defaults = autoReplyDefaults(definition);
  const meetup = { ...base, deliveryMethod: "meetup" as const };

  test("a rewritten slot changes both parts, and only that slot", () => {
    const { subject, text, html } = renderGearRequestConfirmationEmail(meetup, {
      ...defaults,
      subject: "Your kit is reserved",
      intro: "These are set aside for you:",
    });

    expect(subject).toBe("Your kit is reserved");
    for (const part of [text, html]) {
      expect(part).toContain("These are set aside for you:");
      // The sentence a tenant may need to be different is gone when they
      // rewrite it, and nothing else moved.
      expect(part).not.toContain("no longer available to others");
      expect(part).toContain("Hi Jo Rivera,");
      expect(part).toContain("— Chatter Snow");
    }
  });

  test("a closing the tenant wrote lands under their instructions", () => {
    expect(defaults.closing).toBe("");
    const { text, html } = renderGearRequestConfirmationEmail(
      { ...meetup, instructions: "We hand gear over at the trailhead." },
      { ...defaults, closing: "Questions? Just reply to this email." },
    );
    for (const part of [text, html]) {
      expect(part.indexOf("Questions?")).toBeGreaterThan(
        part.indexOf("trailhead"),
      );
    }
  });

  test("the item list and the instructions survive any copy", () => {
    const blanked = Object.fromEntries(
      Object.keys(defaults).map((key) => [key, ""]),
    ) as typeof defaults;
    const { text, html } = renderGearRequestConfirmationEmail(
      { ...meetup, instructions: "Saturdays at the trailhead." },
      blanked,
    );

    for (const part of [text, html]) {
      expect(part).toContain("Burton Custom 158");
      expect(part).toContain("pick these up in person");
      expect(part).toContain("Saturdays at the trailhead.");
    }
    expect(text).not.toContain("\n\n\n");
  });

  test("escapes markup and ampersands once, in the HTML part only", () => {
    const { text, html } = renderGearRequestConfirmationEmail(
      {
        ...meetup,
        orgName: "Ben & Jerry's",
        requesterName: "<script>alert(1)</script>",
        items: ["Rock & <b>Roll</b> board"],
      },
      { ...defaults, closing: "Tea & <i>biscuits</i> provided." },
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("Tea &amp; &lt;i&gt;biscuits&lt;/i&gt; provided.");
    expect(html).toContain("Rock &amp; &lt;b&gt;Roll&lt;/b&gt; board");
    expect(html).toContain("Ben &amp; Jerry&#39;s");
    expect(html).not.toContain("&amp;amp;");
    expect(html).not.toContain("&amp;lt;");
    expect(text).toContain("Tea & <i>biscuits</i> provided.");
    expect(text).toContain("<script>alert(1)</script>");
  });
});
