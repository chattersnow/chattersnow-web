import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { PrivacyDocument } from "@/app/(public)/privacy/document";
import { TermsDocument } from "@/app/(public)/terms/document";
import { CodeOfConductDocument } from "@/app/(public)/code-of-conduct/document";
import { LegalDocument } from "@/components/legal-document";

// The section nav beside each legal document is driven by a hand-written
// SECTIONS array, while the anchors it points at live on <section> elements
// further down the same file. Nothing links the two, so a renamed or dropped
// section leaves a nav entry that scrolls nowhere -- silently, since a bad
// fragment is not an error. These pages are long enough that nobody would
// notice by scrolling.
const PAGES = [
  { name: "privacy policy", Page: PrivacyDocument },
  { name: "terms of use", Page: TermsDocument },
  { name: "code of conduct", Page: CodeOfConductDocument },
  // A tenant-published document goes through the same shell, so the same
  // invariants hold for it.
  {
    name: "tenant-published document",
    Page: () => (
      <LegalDocument
        doc={{
          title: "House Rules",
          last_updated: "January 1, 2030",
          summary: ["The short version."],
          sections: [
            { id: "one", title: "One", paragraphs: ["First."] },
            { id: "two", title: "Two", paragraphs: ["Second.", "Third."] },
          ],
        }}
      />
    ),
  },
];

describe("legal page section navs", () => {
  for (const { name, Page } of PAGES) {
    test(`every ${name} nav link points at a section that exists`, () => {
      const { container } = render(<Page />);

      const nav = container.querySelector('nav[aria-label="On this page"]');
      expect(nav, "section nav is rendered").not.toBeNull();

      const targets = [...nav!.querySelectorAll("a")].map((a) =>
        a.getAttribute("href")!.replace(/^#/, ""),
      );
      expect(targets.length).toBeGreaterThan(0);

      for (const id of targets) {
        expect(
          container.querySelector(`section#${id}`),
          `#${id} is linked from the nav but no section has that id`,
        ).not.toBeNull();
      }
    });

    test(`every ${name} section is listed in the nav`, () => {
      const { container } = render(<Page />);

      const listed = new Set(
        [...container.querySelectorAll('nav[aria-label="On this page"] a')].map(
          (a) => a.getAttribute("href")!.replace(/^#/, ""),
        ),
      );

      for (const section of container.querySelectorAll("section[id]")) {
        // The lead section carrying the <h1> and the "last updated" line is
        // deliberately not listed -- it is where the reader already is, and
        // it is the target of the "Back to top" link.
        if (section.id === "top") continue;

        expect(
          listed.has(section.id),
          `section #${section.id} exists but is missing from the nav`,
        ).toBe(true);
      }
    });

    // Below `lg` the rail is swapped for a collapsed <details>. It is a second
    // hand-rendered copy of the same list, so it can drift out of step with
    // the rail on its own.
    test(`the ${name} mobile section list matches the rail`, () => {
      const { container } = render(<Page />);

      const hrefs = (selector: string) =>
        [...container.querySelectorAll(`${selector} a`)].map((a) =>
          a.getAttribute("href"),
        );

      const rail = hrefs('nav[aria-label="On this page"]');
      const collapsed = hrefs("details");

      expect(collapsed.length).toBeGreaterThan(0);
      expect(collapsed).toEqual(rail);
    });
  }
});
