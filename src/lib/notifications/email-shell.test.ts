import { describe, expect, test } from "bun:test";
import {
  contrastRatio,
  emailLogoUrl,
  emailPalette,
  emailShellContext,
  EMAIL_DEFAULT_ACCENT,
  EMAIL_LOGO_WIDTH,
  EMPTY_EMAIL_BRANDING,
  renderEmailShell,
  type EmailBranding,
} from "./email-shell";
import { withRemoteImagesBlocked } from "./auto-reply-preview";

const ORG = "Riverside Community Center";
const SITE = "https://riverside.example";

/** A palette that passes both floors: a dark teal accent over a darker text. */
const TEAL: EmailBranding = {
  logoUrl: null,
  primary: "#0f766e",
  primaryDeep: "#134e4a",
};

function shell(
  branding: EmailBranding,
  overrides: Partial<{ orgName: string; siteUrl: string }> = {},
) {
  return renderEmailShell({
    orgName: overrides.orgName ?? ORG,
    siteUrl: overrides.siteUrl ?? SITE,
    branding,
    bodyHtml: `  <p>Hello.</p>`,
  });
}

describe("contrastRatio", () => {
  test("is 1 for a colour against itself and 21 for black on white", () => {
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 4);
  });

  test("is symmetric", () => {
    expect(contrastRatio("#0f766e", "#ffffff")).toBeCloseTo(
      contrastRatio("#ffffff", "#0f766e"),
      10,
    );
  });
});

describe("emailPalette", () => {
  test("a tenant with no branding gets the platform's accent", () => {
    const palette = emailPalette(EMPTY_EMAIL_BRANDING);
    expect(palette.link).toBe(EMAIL_DEFAULT_ACCENT);
    expect(palette.wordmark).toBe(EMAIL_DEFAULT_ACCENT);
  });

  test("a readable brand colour is used for links and its deep form for the wordmark", () => {
    const palette = emailPalette(TEAL);
    expect(palette.link).toBe("#0f766e");
    expect(palette.wordmark).toBe("#134e4a");
  });

  /**
   * The case this floor exists for: an accent picked to sit on a tinted page
   * behind a heading is unreadable as 15px link text on white.
   */
  test("an accent too pale to read as link text falls to the tenant's deep colour", () => {
    const palette = emailPalette({
      logoUrl: null,
      primary: "#f4d35e",
      primaryDeep: "#134e4a",
    });
    expect(palette.link).toBe("#134e4a");
  });

  test("a tenant whose colours both fail gets the platform's accent, not an unreadable one", () => {
    const palette = emailPalette({
      logoUrl: null,
      primary: "#f4d35e",
      primaryDeep: "#f59e42",
    });
    expect(palette.link).toBe(EMAIL_DEFAULT_ACCENT);
    expect(palette.wordmark).toBe(EMAIL_DEFAULT_ACCENT);
  });

  /**
   * The two floors are different on purpose: 20px bold is large text under
   * WCAG, so a colour that is wrong for a link can still be right for a
   * wordmark, and rejecting it there would print somebody else's brand.
   */
  test("the wordmark's floor is looser than the link's", () => {
    const palette = emailPalette({
      logoUrl: null,
      primary: "#3b82f6",
      primaryDeep: null,
    });
    expect(contrastRatio("#3b82f6", "#ffffff")).toBeGreaterThan(3);
    expect(contrastRatio("#3b82f6", "#ffffff")).toBeLessThan(4.5);
    expect(palette.wordmark).toBe("#3b82f6");
    expect(palette.link).toBe(EMAIL_DEFAULT_ACCENT);
  });

  test("a malformed colour typed into app_settings is ignored, not emitted", () => {
    const palette = emailPalette({
      logoUrl: null,
      primary: "red; background: url(x)",
      primaryDeep: null,
    });
    expect(palette.link).toBe(EMAIL_DEFAULT_ACCENT);
  });
});

describe("emailLogoUrl", () => {
  test("keeps an absolute https URL", () => {
    expect(emailLogoUrl("https://cdn.example.org/logo.png", SITE)).toBe(
      "https://cdn.example.org/logo.png",
    );
  });

  /**
   * Chatter Snow's own logo is a path in `public/` (#1267). A path renders
   * fine on the website and is meaningless in an inbox.
   */
  test("resolves a path this site serves against the tenant's own origin", () => {
    expect(emailLogoUrl("/chatter-logo-transparent.png", SITE)).toBe(
      "https://riverside.example/chatter-logo-transparent.png",
    );
  });

  test("drops anything that is not http or https", () => {
    expect(emailLogoUrl("data:image/png;base64,AAAA", SITE)).toBeNull();
    expect(emailLogoUrl("javascript:alert(1)", SITE)).toBeNull();
  });

  test("drops a path when there is no origin to resolve it against", () => {
    expect(emailLogoUrl("/logo.png", "")).toBeNull();
  });

  test("is null for an unset or blank value", () => {
    expect(emailLogoUrl(null, SITE)).toBeNull();
    expect(emailLogoUrl("   ", SITE)).toBeNull();
  });
});

describe("renderEmailShell", () => {
  test("carries the body through untouched", () => {
    expect(shell(TEAL)).toContain("<p>Hello.</p>");
  });

  test("a tenant with no logo gets its name as a text wordmark, and no image", () => {
    const html = shell(TEAL);
    expect(html).not.toContain("<img");
    expect(html).toContain(ORG);
    expect(html).toContain("#134e4a");
  });

  test("a tenant with a logo gets it, alt-texted with the organization's name", () => {
    const html = shell({ ...TEAL, logoUrl: "https://cdn.example.org/l.png" });
    expect(html).toContain('src="https://cdn.example.org/l.png"');
    expect(html).toContain(`alt="${ORG}"`);
    expect(html).toContain(`width="${EMAIL_LOGO_WIDTH}"`);
    expect(html).toContain("display: block");
  });

  /**
   * The acceptance criterion the header alone cannot meet: most clients block
   * remote images, and an email whose only sign of who sent it is a logo says
   * nothing at all in that state.
   */
  test("still names the organization with every remote image blocked", () => {
    const blocked = withRemoteImagesBlocked(
      shell({ ...TEAL, logoUrl: "https://cdn.example.org/l.png" }),
    );
    expect(blocked).not.toContain(' src="https://cdn.example.org/l.png"');
    // Twice: the blocked image's alt text, and the footer under the rule.
    expect(blocked.split(ORG).length - 1).toBeGreaterThanOrEqual(2);
  });

  test("the alt text carries the wordmark's own type, for the blocked state", () => {
    const html = shell({ ...TEAL, logoUrl: "https://cdn.example.org/l.png" });
    const img = html.slice(
      html.indexOf("<img"),
      html.indexOf(">", html.indexOf("<img")),
    );
    expect(img).toContain("font-weight: 700");
    expect(img).toContain("#134e4a");
  });

  test("the footer links the organization's name to its own site", () => {
    expect(shell(TEAL)).toContain(`<a href="${SITE}"`);
  });

  test("escapes a name that contains markup", () => {
    const html = shell(TEAL, { orgName: 'Snow & "Co" <script>' });
    expect(html).toContain("Snow &amp; &quot;Co&quot; &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  /** Outlook on Windows renders through Word: no stylesheet, no flex, no grid. */
  test("is email HTML rather than web HTML", () => {
    const html = shell(TEAL);
    expect(html).toContain("<table");
    expect(html).toContain("<!--[if mso]>");
    expect(html).not.toContain("<link");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("display: flex");
    expect(html).not.toContain("display: grid");
    expect(html).not.toContain("@font-face");
  });

  test("states its own background and text colour rather than inheriting them", () => {
    const html = shell(TEAL);
    expect(html).toContain("background-color: #ffffff");
    expect(html).toContain("color: #1c1917");
  });
});

describe("emailShellContext", () => {
  test("an absent brand renders the shell with no header and no footer", () => {
    const html = renderEmailShell({
      ...emailShellContext(undefined, SITE),
      bodyHtml: "  <p>Hello.</p>",
    });
    expect(html).toContain("<p>Hello.</p>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain(SITE);
  });

  test("a brand supplies the name and colours the renderer does not hold", () => {
    const context = emailShellContext({ orgName: ORG, branding: TEAL }, SITE);
    expect(context).toEqual({ orgName: ORG, siteUrl: SITE, branding: TEAL });
  });
});
