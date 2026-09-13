import { describe, expect, test } from "bun:test";
import {
  buildSecurityTxt,
  securityContactUri,
  securityTxtExpires,
} from "@/lib/security-txt";

const base = {
  organization: "Example Nonprofit",
  contact: "mailto:security@example.org",
  note: [] as string[],
  origin: "https://example.org",
  policyUrl: null,
  now: new Date("2026-09-12T18:30:00.000Z"),
};

describe("securityContactUri", () => {
  test("a bare address becomes a mailto: URI", () => {
    expect(securityContactUri("security@example.org")).toBe(
      "mailto:security@example.org",
    );
    expect(securityContactUri("  security@example.org  ")).toBe(
      "mailto:security@example.org",
    );
  });

  test("a URI an administrator typed in full is left alone", () => {
    expect(securityContactUri("mailto:security@example.org")).toBe(
      "mailto:security@example.org",
    );
    expect(securityContactUri("https://example.org/security")).toBe(
      "https://example.org/security",
    );
  });

  // Each of these would render a file whose only actionable field cannot be
  // acted on, which is the state this route refuses to publish in.
  test.each([
    ["", "unset"],
    ["   ", "whitespace"],
    ["call the office", "prose"],
    ["+1 555 0100", "a phone number"],
    ["security@example", "no dot in the domain"],
    ["http://example.org/security", "not https"],
    ["javascript:alert(1)", "a scheme that is not a way to reach anyone"],
  ])("%p is not a contact (%s)", (value) => {
    expect(securityContactUri(value)).toBeNull();
  });
});

describe("securityTxtExpires", () => {
  // The required field, and the reason the file it replaced carried a note
  // asking a maintainer to bump it every year.
  test("is a year on, anchored to midnight UTC", () => {
    expect(securityTxtExpires(new Date("2026-09-12T18:30:00.000Z"))).toBe(
      "2027-09-12T00:00:00.000Z",
    );
  });

  test("is under a year ahead of the request that rendered it", () => {
    const now = new Date("2026-09-12T00:00:00.000Z");
    const expires = new Date(securityTxtExpires(now));
    const aYearOn = new Date("2027-09-12T00:00:00.000Z");
    expect(expires.getTime()).toBeGreaterThan(now.getTime());
    expect(expires.getTime()).toBeLessThanOrEqual(aYearOn.getTime());
  });

  test("crossing a leap day does not produce an invalid date", () => {
    expect(securityTxtExpires(new Date("2028-02-29T09:00:00.000Z"))).toBe(
      "2029-03-01T00:00:00.000Z",
    );
  });
});

describe("buildSecurityTxt", () => {
  test("carries the fields RFC 9116 requires", () => {
    const file = buildSecurityTxt(base);
    expect(file).toContain("Contact: mailto:security@example.org");
    expect(file).toContain("Expires: 2027-09-12T00:00:00.000Z");
    expect(file).toContain(
      "Canonical: https://example.org/.well-known/security.txt",
    );
    expect(file.endsWith("\n")).toBe(true);
  });

  // The half of #975 that made the old file formally invalid rather than
  // merely wrong: served from demo.rickiecruz.com it still claimed to be
  // canonical at chattersnow.org.
  test("Canonical is the host the request arrived on", () => {
    const file = buildSecurityTxt({
      ...base,
      origin: "https://demo.rickiecruz.com",
    });
    expect(file).toContain(
      "Canonical: https://demo.rickiecruz.com/.well-known/security.txt",
    );
    expect(file).not.toContain("example.org/.well-known");
  });

  test("Policy appears only for a tenant whose terms are in force", () => {
    expect(buildSecurityTxt(base)).not.toContain("Policy:");
    expect(
      buildSecurityTxt({ ...base, policyUrl: "https://example.org/terms" }),
    ).toContain("Policy: https://example.org/terms");
  });

  test("names the organization, and names none when there is none", () => {
    expect(buildSecurityTxt(base)).toContain("# Example Nonprofit -- how to");
    expect(buildSecurityTxt({ ...base, organization: null })).toContain(
      "# This site -- how to",
    );
  });

  test("the tenant's note is rendered above the platform's own", () => {
    const file = buildSecurityTxt({
      ...base,
      note: ["We are volunteers and there is no bounty programme."],
    });
    expect(file).toContain(
      "# We are volunteers and there is no bounty programme.",
    );
    expect(file.indexOf("no bounty programme")).toBeLessThan(
      file.indexOf("row-level security"),
    );
  });

  // A tenant's note is free text from a settings form. Every line of it is a
  // comment, so a note that looks like a field cannot become one.
  test("a note cannot smuggle in a field", () => {
    const file = buildSecurityTxt({
      ...base,
      note: ["Contact: mailto:attacker@example.com", "line\nbreak"],
    });
    for (const line of file.split("\n")) {
      expect(line.startsWith("Contact:")).toBe(
        line === "Contact: mailto:security@example.org",
      );
    }
    expect(file).toContain("# Contact: mailto:attacker@example.com");
    expect(file).toContain("# line\n# break");
  });

  test("prose is wrapped, and the fields are not", () => {
    const file = buildSecurityTxt({
      ...base,
      note: [
        "A single very long paragraph that has to be broken across several lines so that anyone reading it in a terminal is not asked to scroll sideways through it.",
      ],
      contact: `mailto:${"a".repeat(90)}@example.org`,
    });
    const comments = file
      .split("\n")
      .filter((line) => line.startsWith("# "))
      .map((line) => line.length);
    expect(Math.max(...comments)).toBeLessThanOrEqual(76);
    expect(file).toContain(`Contact: mailto:${"a".repeat(90)}@example.org`);
  });

  test("says nothing about an organization it was not told about", () => {
    const file = buildSecurityTxt({ ...base, organization: null });
    expect(file).not.toMatch(/chatter/i);
  });
});
