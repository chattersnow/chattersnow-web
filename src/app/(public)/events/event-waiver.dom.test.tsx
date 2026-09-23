import { describe, expect, test } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventWaiver } from "./event-waiver";
import type { LegalDocumentContent } from "@/lib/site-content";

const DOC: LegalDocumentContent = {
  title: "Participant Waiver",
  last_updated: "September 22, 2026",
  summary: [
    "- You release us from claims for ordinary negligence.\n- Snow sports carry real risk of injury.",
  ],
  sections: [
    {
      id: "risks",
      title: "Risks of taking part",
      paragraphs: [
        "Skiing and snowboarding are **dangerous**.",
        "- Falls\n- Collisions",
      ],
    },
    {
      id: "questions",
      title: "Questions",
      paragraphs: ["Ask us at [our contact page](/contact)."],
    },
  ],
};

function renderWaiver(doc: LegalDocumentContent = DOC) {
  return render(<EventWaiver doc={doc} version={2} headingId="waiver-title" />);
}

async function openFullText() {
  await userEvent.click(
    screen.getByRole("button", { name: "Read the full agreement" }),
  );
  return screen.findByRole("dialog", { name: "Participant Waiver" });
}

describe("EventWaiver", () => {
  // #1402: the title and the tenant's own summary where the box is, and the
  // full text one tap away -- not a scroll box inside a scrolling page.
  test("shows the title and the summary, and no scroll box", () => {
    const { container } = renderWaiver();

    expect(
      screen.getByRole("heading", { level: 3, name: "Participant Waiver" }),
    ).toBeVisible();
    expect(
      screen.getByText("You release us from claims for ordinary negligence."),
    ).toBeVisible();
    expect(screen.queryByText("Risks of taking part")).toBeNull();
    expect(container.querySelector("[class*='overflow-y-auto']")).toBeNull();
    expect(container.querySelector("div[tabindex]")).toBeNull();
  });

  // The whole document, same version, every word -- in a sheet rather than
  // inline, so "did they see it" is still a tap from the box.
  test("opens every section in full in a sheet", async () => {
    renderWaiver();

    const sheet = await openFullText();

    expect(within(sheet).getByText(/Version 2/)).toBeVisible();
    expect(within(sheet).getByText("Risks of taking part")).toBeVisible();
    expect(within(sheet).getByText("Questions")).toBeVisible();
    expect(
      within(sheet).getByText(
        "You release us from claims for ordinary negligence.",
      ),
    ).toBeVisible();
    expect(within(sheet).getByText("Falls")).toBeVisible();
    expect(within(sheet).getByText("dangerous")).toBeVisible();
  });

  // The sheet's title is its h2, so the sections sit at h3 inside it.
  test("keeps the heading outline honest inside the sheet", async () => {
    renderWaiver();

    const sheet = await openFullText();

    expect(
      within(sheet)
        .getAllByRole("heading", { level: 3 })
        .map((node) => node.textContent),
    ).toEqual(["Risks of taking part", "Questions"]);
  });

  test("closes back to the registration", async () => {
    renderWaiver();

    const sheet = await openFullText();
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Back to registration" }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Participant Waiver" }),
    ).toBeNull();
  });

  // A tenant that has written no summary still gets the title and the button;
  // the platform writes no summary on its behalf.
  test("with no summary, shows the title and the button only", () => {
    renderWaiver({ ...DOC, summary: [] });

    expect(
      screen.getByRole("heading", { level: 3, name: "Participant Waiver" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Read the full agreement" }),
    ).toBeVisible();
  });

  test("names the version and links that exact one", () => {
    renderWaiver();

    expect(screen.getByText(/Version 2/)).toBeVisible();
    // Not `/waiver`: a permalink to the version on screen is what the
    // registration's stored pointer resolves to.
    expect(
      screen.getByRole("link", { name: /open this version/i }),
    ).toHaveAttribute("href", "/waiver?version=2");
  });

  // The ids belong to /waiver's section rail. A second copy of them inside a
  // form would be a real duplicate-id bug rather than a cosmetic one.
  test("carries none of the document page's section anchors", async () => {
    renderWaiver();

    await openFullText();

    expect(document.querySelector("#risks")).toBeNull();
    expect(document.querySelector("#questions")).toBeNull();
  });
});
