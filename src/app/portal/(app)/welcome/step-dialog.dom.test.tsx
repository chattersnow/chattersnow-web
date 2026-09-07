import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sparkles } from "lucide-react";

const onDismiss = mock(async () => ({ success: true }) as const);

const { StepDialog } = await import("./step-dialog");
const { WELCOME_STEPS } = await import("./welcome-steps");

const MULTI = WELCOME_STEPS;
const SINGLE = [
  {
    key: "only",
    icon: Sparkles,
    title: "One thing changed",
    body: <p>Body.</p>,
  },
];

function renderMulti(initialOpen = true) {
  return render(
    <StepDialog
      initialOpen={initialOpen}
      steps={MULTI}
      finishLabel="Get started"
      srLabel="the portal introduction"
      onDismiss={onDismiss}
    />,
  );
}

describe("StepDialog", () => {
  beforeEach(() => {
    onDismiss.mockClear();
  });

  test("stays closed when it isn't owed", () => {
    renderMulti(false);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test("opens on the first step", async () => {
    renderMulti();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: MULTI[0].title }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
  });

  test("Next advances and Back returns, without recording a dismissal", async () => {
    const user = userEvent.setup();
    renderMulti();
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("heading", { name: MULTI[1].title }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("heading", { name: MULTI[0].title }),
    ).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  test("the last step swaps Next and Skip for the finish label", async () => {
    const user = userEvent.setup();
    renderMulti();
    await screen.findByRole("dialog");

    for (let i = 0; i < MULTI.length - 1; i += 1) {
      await user.click(screen.getByRole("button", { name: "Next" }));
    }

    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Skip" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Get started" }),
    ).toBeInTheDocument();
  });

  test("finishing closes it and records the dismissal", async () => {
    const user = userEvent.setup();
    renderMulti();
    await screen.findByRole("dialog");

    for (let i = 0; i < MULTI.length - 1; i += 1) {
      await user.click(screen.getByRole("button", { name: "Next" }));
    }
    await user.click(screen.getByRole("button", { name: "Get started" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("Skip records it too, so it isn't owed twice", async () => {
    const user = userEvent.setup();
    renderMulti();
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("closing with the X records it as well", async () => {
    const user = userEvent.setup();
    renderMulti();
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("a single step drops the Skip button and the step dots", async () => {
    const user = userEvent.setup();
    render(
      <StepDialog
        initialOpen
        steps={SINGLE}
        finishLabel="Got it"
        srLabel="what's new"
        onDismiss={onDismiss}
      />,
    );
    await screen.findByRole("dialog");

    expect(
      screen.queryByRole("button", { name: "Skip" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("release notes", () => {
  test("every entry is renderable and keyed", async () => {
    const { RELEASE_NOTES, CURRENT_RELEASE } = await import("./releases");

    // An empty list is a legitimate state (a release with nothing user-facing
    // to say); the layout renders no dialog at all for it. What must not
    // happen is entries with duplicate keys or missing copy.
    expect(CURRENT_RELEASE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Set(RELEASE_NOTES.map((n) => n.key)).size).toBe(
      RELEASE_NOTES.length,
    );
    for (const note of RELEASE_NOTES) {
      expect(note.title.length).toBeGreaterThan(0);
      expect(note.body).toBeTruthy();
    }
  });

  test("the notes render through the dialog", async () => {
    const { RELEASE_NOTES } = await import("./releases");
    if (RELEASE_NOTES.length === 0) return;

    render(
      <StepDialog
        initialOpen
        steps={RELEASE_NOTES}
        finishLabel="Got it"
        srLabel="what's new"
        onDismiss={onDismiss}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: RELEASE_NOTES[0].title }),
    ).toBeInTheDocument();
  });
});
