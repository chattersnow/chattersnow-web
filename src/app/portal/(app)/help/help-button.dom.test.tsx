import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let pathname = "/portal/home";

mock.module("next/navigation", () => ({
  usePathname: () => pathname,
}));

const { HelpButton } = await import("./help-button");
const { PageHelpContent, PortalHelpProvider } = await import("./help-context");

function renderHelpButton(extra?: React.ReactNode) {
  return render(
    <PortalHelpProvider>
      <HelpButton />
      {extra}
    </PortalHelpProvider>,
  );
}

describe("HelpButton", () => {
  test("renders the trigger, closed by default", () => {
    pathname = "/portal/home";
    renderHelpButton();

    expect(
      screen.getByRole("button", { name: "Help for this page" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("shows the entry registered for the current page", async () => {
    pathname = "/portal/events";
    const user = userEvent.setup();
    renderHelpButton();

    await user.click(
      screen.getByRole("button", { name: "Help for this page" }),
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "How status and visibility work" }),
    ).toBeInTheDocument();
  });

  test("falls back to the module entry for an unregistered subroute", async () => {
    pathname = "/portal/calendar/1234";
    const user = userEvent.setup();
    renderHelpButton();

    await user.click(
      screen.getByRole("button", { name: "Help for this page" }),
    );

    expect(
      await screen.findByRole("heading", { name: "How calendar items work" }),
    ).toBeInTheDocument();
  });

  test("falls back to portal basics when no entry matches", async () => {
    pathname = "/portal/people";
    const user = userEvent.setup();
    renderHelpButton();

    await user.click(
      screen.getByRole("button", { name: "Help for this page" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Portal basics" }),
    ).toBeInTheDocument();
  });

  test("page-registered content overrides the registry", async () => {
    pathname = "/portal/finance/expenses";
    const user = userEvent.setup();
    renderHelpButton(
      <PageHelpContent title="How expense approval works">
        <p>Below $500, finance can approve their own submission.</p>
      </PageHelpContent>,
    );

    await user.click(
      screen.getByRole("button", { name: "Help for this page" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "How expense approval works",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Below $500, finance can approve their own submission."),
    ).toBeInTheDocument();
  });
});
