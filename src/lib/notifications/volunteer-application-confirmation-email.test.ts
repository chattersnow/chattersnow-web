import { describe, expect, test } from "bun:test";
import {
  renderVolunteerApplicationConfirmationEmail,
  type VolunteerApplicationConfirmation,
} from "./volunteer-application-confirmation-email";
import { autoReplyDefaults } from "@/lib/notifications/auto-replies";
import { requireAutoReplyDefinition } from "@/lib/notifications/auto-reply-email";
import { VOLUNTEER_APPLICATION_CONFIRMATION_KIND } from "@/lib/notifications/kinds";

const base: VolunteerApplicationConfirmation = {
  orgName: "Chatter Snow",
  applicantName: "Jo Rivera",
  referenceCode: "DUBFF2FN",
  siteUrl: "https://chattersnow.example",
};

describe("renderVolunteerApplicationConfirmationEmail", () => {
  test("carries the reference code and the status link in both parts", () => {
    const { subject, text, html } =
      renderVolunteerApplicationConfirmationEmail(base);

    expect(subject).toBe("Your application — Chatter Snow");
    for (const part of [text, html]) {
      expect(part).toContain("Jo Rivera");
      // The code is the whole reason this email exists.
      expect(part).toContain("DUBFF2FN");
      expect(part).toContain(
        "https://chattersnow.example/get-involved/volunteer/status",
      );
      expect(part).toContain("Chatter Snow");
    }
  });

  test("says the address is needed at the status page too", () => {
    // The page asks for the code *and* the address it was sent to, and only
    // one of those is in front of the reader.
    const { text, html } = renderVolunteerApplicationConfirmationEmail(base);
    for (const part of [text, html]) {
      expect(part).toContain("email address you applied with");
    }
  });

  test("greets an applicant who gave no name without a dangling space", () => {
    const { text } = renderVolunteerApplicationConfirmationEmail({
      ...base,
      applicantName: "",
    });
    expect(text).toStartWith("Hi,\n");
    expect(text).toContain("DUBFF2FN");
  });

  test("carries back neither the availability, the role nor the phone", () => {
    // There are no such fields on the payload, which is the real guarantee.
    // run_retention_purge hard-deletes these applications on a schedule, and
    // an inbox is somewhere that clock cannot reach.
    expect(Object.keys(base)).not.toContain("availability");
    expect(Object.keys(base)).not.toContain("roleInterest");
    expect(Object.keys(base)).not.toContain("phone");
  });

  test("names no volunteer role, since no tenant lends that word", () => {
    // lexicon.* covers the collection and item vocabulary only, so platform
    // code must not assume a tenant calls these people volunteers.
    const { subject, text, html } =
      renderVolunteerApplicationConfirmationEmail(base);
    for (const part of [subject, text, html]) {
      expect(part.toLowerCase()).not.toContain("volunteer role");
    }
    expect(text).toContain("your application");
  });

  test("does not double the slash on an origin that has a trailing one", () => {
    const { text, html } = renderVolunteerApplicationConfirmationEmail({
      ...base,
      siteUrl: "https://chattersnow.example/",
    });
    for (const part of [text, html]) {
      expect(part).toContain(
        "https://chattersnow.example/get-involved/volunteer/status",
      );
      expect(part).not.toContain("//get-involved");
    }
  });

  test("escapes what came off the public form", () => {
    const { html } = renderVolunteerApplicationConfirmationEmail({
      ...base,
      applicantName: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("the tenant's own copy (#1234)", () => {
  const definition = requireAutoReplyDefinition(
    VOLUNTEER_APPLICATION_CONFIRMATION_KIND,
  );
  const defaults = autoReplyDefaults(definition);

  test("a rewritten slot changes both parts, and only that slot", () => {
    const { subject, text, html } = renderVolunteerApplicationConfirmationEmail(
      base,
      {
        ...defaults,
        subject: "Thanks for offering to help, {{first_name}}",
        intro: "Someone on the crew will read this within the week.",
      },
    );

    expect(subject).toBe("Thanks for offering to help, Jo Rivera");
    for (const part of [text, html]) {
      expect(part).toContain("within the week");
      expect(part).not.toContain("Thanks for applying.");
      expect(part).toContain("Hi Jo Rivera,");
      expect(part).toContain("— Chatter Snow");
    }
  });

  test("a closing the tenant wrote lands under the code and the link", () => {
    // Empty by default, so this slot renders nothing at all until they fill it.
    expect(defaults.closing).toBe("");
    const { text, html } = renderVolunteerApplicationConfirmationEmail(base, {
      ...defaults,
      closing: "We run orientation on the first Saturday of the month.",
    });
    for (const part of [text, html]) {
      expect(part.indexOf("orientation")).toBeGreaterThan(
        part.indexOf("/get-involved/volunteer/status"),
      );
    }
  });

  test("the code, the note and the status link survive any copy", () => {
    const blanked = Object.fromEntries(
      Object.keys(defaults).map((key) => [key, ""]),
    ) as typeof defaults;
    const { text, html } = renderVolunteerApplicationConfirmationEmail(
      base,
      blanked,
    );

    for (const part of [text, html]) {
      // The code is the only key to the status page; no copy may lose it.
      expect(part).toContain("DUBFF2FN");
      expect(part).toContain("email address you applied with");
      expect(part).toContain(
        "https://chattersnow.example/get-involved/volunteer/status",
      );
    }
    expect(text).not.toContain("\n\n\n");
  });

  test("escapes markup and ampersands once, in the HTML part only", () => {
    const { text, html } = renderVolunteerApplicationConfirmationEmail(
      {
        ...base,
        orgName: "Ben & Jerry's",
        applicantName: "<script>alert(1)</script>",
      },
      { ...defaults, intro: "Tea & <b>cake</b> on arrival." },
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("Tea &amp; &lt;b&gt;cake&lt;/b&gt; on arrival.");
    expect(html).toContain("Ben &amp; Jerry&#39;s");
    expect(html).not.toContain("&amp;amp;");
    expect(html).not.toContain("&amp;lt;");
    expect(text).toContain("Tea & <b>cake</b> on arrival.");
    expect(text).toContain("<script>alert(1)</script>");
  });
});
