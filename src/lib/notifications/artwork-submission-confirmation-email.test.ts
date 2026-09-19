import { describe, expect, test } from "bun:test";
import {
  renderArtworkSubmissionConfirmationEmail,
  type ArtworkSubmissionConfirmation,
} from "./artwork-submission-confirmation-email";
import { autoReplyDefaults } from "@/lib/notifications/auto-replies";
import { requireAutoReplyDefinition } from "@/lib/notifications/auto-reply-email";
import { ARTWORK_SUBMISSION_CONFIRMATION_KIND } from "@/lib/notifications/kinds";

const base: ArtworkSubmissionConfirmation = {
  orgName: "Chatter Snow",
  artistName: "Ari Nakamura",
  callTitle: "Zine Vol. 2",
  title: "Snowline",
  imageCount: 3,
};

describe("renderArtworkSubmissionConfirmationEmail", () => {
  test("names the piece, the call and the image count in both parts", () => {
    const { subject, text, html } =
      renderArtworkSubmissionConfirmationEmail(base);

    expect(subject).toBe("We got your submission — Chatter Snow");
    for (const part of [text, html]) {
      expect(part).toContain("Ari Nakamura");
      expect(part).toContain("Snowline");
      expect(part).toContain("Zine Vol. 2");
      expect(part).toContain("3 images");
      expect(part).toContain("Chatter Snow");
    }
  });

  test("counts one image in the singular", () => {
    const { text } = renderArtworkSubmissionConfirmationEmail({
      ...base,
      imageCount: 1,
    });
    expect(text).toContain("1 image");
    expect(text).not.toContain("1 images");
  });

  test("leaves the piece out rather than naming it Untitled", () => {
    // The form does not ask for a title, and inventing one would be this
    // email putting words in the artist's mouth.
    for (const title of [null, "   "]) {
      const { text, html } = renderArtworkSubmissionConfirmationEmail({
        ...base,
        title,
      });
      for (const part of [text, html]) {
        expect(part).not.toContain("Piece");
        expect(part).not.toContain("Untitled");
        expect(part).toContain("Zine Vol. 2");
        expect(part).toContain("3 images");
      }
    }
  });

  test("carries no image, no statement and no portfolio link", () => {
    // There are no such fields on the payload, which is the real guarantee.
    for (const key of ["images", "statement", "portfolioUrl", "medium"]) {
      expect(Object.keys(base)).not.toContain(key);
    }
    const { html } = renderArtworkSubmissionConfirmationEmail(base);
    expect(html).not.toContain("<img");
  });

  test("greets an artist who gave no name without a dangling space", () => {
    const { text } = renderArtworkSubmissionConfirmationEmail({
      ...base,
      artistName: "",
    });
    expect(text).toStartWith("Hi,\n");
  });

  test("escapes what came off the public form", () => {
    const { html } = renderArtworkSubmissionConfirmationEmail({
      ...base,
      title: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("the tenant's own copy (#1233)", () => {
  const definition = requireAutoReplyDefinition(
    ARTWORK_SUBMISSION_CONFIRMATION_KIND,
  );
  const defaults = autoReplyDefaults(definition);

  test("a rewritten slot changes both parts, and only that slot", () => {
    const { subject, text, html } = renderArtworkSubmissionConfirmationEmail(
      base,
      {
        ...defaults,
        subject: "Your work reached us, {{first_name}}",
        closing: "The jury meets in April and everyone hears back that week.",
      },
    );

    expect(subject).toBe("Your work reached us, Ari Nakamura");
    for (const part of [text, html]) {
      expect(part).toContain("The jury meets in April");
      expect(part).not.toContain("once the call closes");
      expect(part).toContain("Hi Ari Nakamura,");
      expect(part).toContain("— Chatter Snow");
    }
  });

  test("the details survive any copy", () => {
    const blanked = Object.fromEntries(
      Object.keys(defaults).map((key) => [key, ""]),
    ) as typeof defaults;
    const { text, html } = renderArtworkSubmissionConfirmationEmail(
      base,
      blanked,
    );

    for (const part of [text, html]) {
      expect(part).toContain("Snowline");
      expect(part).toContain("Zine Vol. 2");
      expect(part).toContain("3 images");
    }
    expect(text).not.toContain("\n\n\n");
  });

  test("escapes markup and ampersands once, in the HTML part only", () => {
    const { text, html } = renderArtworkSubmissionConfirmationEmail(
      { ...base, orgName: "Ben & Jerry's", callTitle: "Ink & <b>Snow</b>" },
      { ...defaults, closing: "Tea & cake at the opening." },
    );

    expect(html).toContain("Ink &amp; &lt;b&gt;Snow&lt;/b&gt;");
    expect(html).toContain("Tea &amp; cake at the opening.");
    expect(html).toContain("Ben &amp; Jerry&#39;s");
    expect(html).not.toContain("&amp;amp;");
    expect(text).toContain("Ink & <b>Snow</b>");
    expect(text).toContain("Tea & cake at the opening.");
  });
});
