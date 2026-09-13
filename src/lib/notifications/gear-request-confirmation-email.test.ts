import { describe, expect, test } from "bun:test";
import { renderGearRequestConfirmationEmail } from "./gear-request-confirmation-email";

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
