import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HowToSection, HowToSheet } from "./how-to-sheet";

describe("HowToSheet", () => {
  test("renders a trigger button that is closed by default", () => {
    render(
      <HowToSheet title="How this works">
        <p>Guidance content.</p>
      </HowToSheet>,
    );

    expect(
      screen.getByRole("button", { name: "How this works" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("opens the sheet and shows its content on trigger click", async () => {
    const user = userEvent.setup();
    render(
      <HowToSheet title="How status and visibility work">
        <HowToSection heading="Steps">
          <p>Status tracks the event lifecycle.</p>
        </HowToSection>
      </HowToSheet>,
    );

    await user.click(screen.getByRole("button", { name: "How this works" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "How status and visibility work",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Steps")).toBeInTheDocument();
    expect(
      screen.getByText("Status tracks the event lifecycle."),
    ).toBeInTheDocument();
  });

  test("supports a custom trigger label and optional description", async () => {
    const user = userEvent.setup();
    render(
      <HowToSheet
        title="How these thresholds are used"
        description="Approval thresholds for expenses and reimbursements."
        triggerLabel="Explain thresholds"
      >
        <p>Content.</p>
      </HowToSheet>,
    );

    await user.click(
      screen.getByRole("button", { name: "Explain thresholds" }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Approval thresholds for expenses and reimbursements."),
    ).toBeInTheDocument();
  });
});

describe("HowToSection", () => {
  test("renders a heading and its content", () => {
    render(
      <HowToSection heading="Common mistakes">
        <p>Forgetting to set visibility.</p>
      </HowToSection>,
    );

    expect(
      screen.getByRole("heading", { name: "Common mistakes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Forgetting to set visibility."),
    ).toBeInTheDocument();
  });
});
