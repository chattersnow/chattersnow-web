import { describe, expect, test } from "bun:test";
import {
  PLATFORM_LEGAL_LAST_UPDATED,
  PLATFORM_LEGAL_SLOT_KEYS,
} from "@/lib/legal-defaults";
import {
  ALL_OFF,
  ALL_ON,
  renderLegalDocuments,
  SLOTS,
} from "./render-legal-documents";

describe("rendering the platform's legal documents", () => {
  test("renders every document, in footer order, with the platform date", () => {
    const markdown = renderLegalDocuments(ALL_ON);
    for (const heading of [
      "# Privacy Policy",
      "# Terms of Use",
      "# Code of Conduct",
      "# Accessibility",
    ]) {
      expect(markdown).toContain(heading);
    }
    expect(markdown.indexOf("# Privacy Policy")).toBeLessThan(
      markdown.indexOf("# Terms of Use"),
    );
    expect(markdown).toContain(
      `_Last updated: ${PLATFORM_LEGAL_LAST_UPDATED}_`,
    );
  });

  // The slot keys are strings, and a typo in one would throw rather than
  // silently skip -- but only if something renders them all. A count would let
  // a fifth document ship unreviewable, which is the thing this tool exists to
  // stop, so the list is compared against the registry itself.
  test("covers every slot the registry has", () => {
    expect([...SLOTS].sort()).toEqual([...PLATFORM_LEGAL_SLOT_KEYS].sort());
  });

  /**
   * The point of `--minimal`: a reviewer approving this text is approving what
   * the smallest tenant is served as well as the largest, and the two differ by
   * a lot (#1291). If these ever render the same, the surface filtering has
   * stopped working and the shorter rendering is lying about what it covers.
   */
  test("the minimal form is shorter, and drops what it does not collect", () => {
    const maximal = renderLegalDocuments(ALL_ON);
    const minimal = renderLegalDocuments(ALL_OFF);
    expect(minimal.length).toBeLessThan(maximal.length);
    expect(maximal).toContain("Artwork submissions");
    expect(minimal).not.toContain("Artwork submissions");
  });

  // Never a real-looking organization: a plausible rendering is one paste away
  // from being published as somebody's actual policy.
  test("the organization is an obvious placeholder", () => {
    expect(renderLegalDocuments(ALL_ON)).toContain("{Organization}");
  });
});
