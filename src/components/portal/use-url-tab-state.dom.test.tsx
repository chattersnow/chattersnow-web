import { afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

let params = new URLSearchParams();
const actualNavigation = await import("next/navigation");
mock.module("next/navigation", () => ({
  ...actualNavigation,
  usePathname: () => "/portal/events/e-1",
  useSearchParams: () => params,
}));

const { useUrlTabState } = await import("./use-url-tab-state");

type Phase = "basic" | "during";
const isPhase = (value: string): value is Phase =>
  value === "basic" || value === "during";

function Harness() {
  const [phase, setPhase] = useUrlTabState<Phase>({
    param: "phase",
    fallback: "basic",
    isValid: isPhase,
  });
  return (
    <>
      <p>phase: {phase}</p>
      <button type="button" onClick={() => setPhase("during")}>
        During
      </button>
    </>
  );
}

afterEach(() => {
  params = new URLSearchParams();
});

describe("useUrlTabState", () => {
  test("falls back when the URL says nothing", () => {
    render(<Harness />);
    expect(screen.getByText("phase: basic")).toBeInTheDocument();
  });

  test("reads the tab from the URL, so a refresh or a shared link lands on it", () => {
    params = new URLSearchParams("phase=during");
    render(<Harness />);
    expect(screen.getByText("phase: during")).toBeInTheDocument();
  });

  test("ignores a stale or hand-edited value", () => {
    params = new URLSearchParams("phase=nonsense");
    render(<Harness />);
    expect(screen.getByText("phase: basic")).toBeInTheDocument();
  });

  test("pushes a history entry, so Back returns to the previous tab", async () => {
    const user = userEvent.setup();
    const pushed: (string | URL | null | undefined)[] = [];
    const original = window.history.pushState.bind(window.history);
    window.history.pushState = ((
      _data: unknown,
      _unused: string,
      url?: string | URL | null,
    ) => {
      pushed.push(url);
    }) as typeof window.history.pushState;

    try {
      render(<Harness />);
      await user.click(screen.getByRole("button", { name: "During" }));
      expect(pushed).toEqual(["/portal/events/e-1?phase=during"]);
    } finally {
      window.history.pushState = original;
    }
  });

  test("keeps the rest of the query string", async () => {
    const user = userEvent.setup();
    params = new URLSearchParams("tab=registrants");
    const pushed: (string | URL | null | undefined)[] = [];
    const original = window.history.pushState.bind(window.history);
    window.history.pushState = ((
      _data: unknown,
      _unused: string,
      url?: string | URL | null,
    ) => {
      pushed.push(url);
    }) as typeof window.history.pushState;

    try {
      render(<Harness />);
      await user.click(screen.getByRole("button", { name: "During" }));
      expect(pushed).toEqual([
        "/portal/events/e-1?tab=registrants&phase=during",
      ]);
    } finally {
      window.history.pushState = original;
    }
  });
});
