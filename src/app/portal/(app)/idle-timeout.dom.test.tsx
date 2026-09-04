import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  IDLE_TIMEOUT_MS,
  LAST_ACTIVITY_KEY,
  SIGNED_OUT_KEY,
} from "@/lib/auth/idle-timeout";

const replaceMock = mock((_href: string) => {});
const refreshMock = mock(() => {});
const actualNavigation = await import("next/navigation");
// One stable object, as the real useRouter returns. A fresh literal per call
// would re-run every effect that depends on the router on every render.
const routerMock = { replace: replaceMock, refresh: refreshMock };
mock.module("next/navigation", () => ({
  ...actualNavigation,
  useRouter: () => routerMock,
}));

const signOutMock = mock(async () => ({ error: null }));
const unsubscribeMock = mock(() => {});
mock.module("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signOut: signOutMock,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: unsubscribeMock } },
      }),
    },
  }),
}));

const { IdleTimeout } = await import("./idle-timeout");

/** Puts the session just inside the warning window. */
function seedWarning() {
  localStorage.setItem(
    LAST_ACTIVITY_KEY,
    String(Date.now() - (IDLE_TIMEOUT_MS - 30_000)),
  );
}

/** Puts the session past its deadline, as a slept-through laptop would. */
function seedExpired() {
  localStorage.setItem(
    LAST_ACTIVITY_KEY,
    String(Date.now() - (IDLE_TIMEOUT_MS + 60_000)),
  );
}

describe("IdleTimeout", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    refreshMock.mockClear();
    signOutMock.mockClear();
    unsubscribeMock.mockClear();
    localStorage.clear();
    // happy-dom starts on about:blank, where `location.pathname` is "blank";
    // the component reads the real location to build its return path.
    (
      window as unknown as { happyDOM: { setURL: (url: string) => void } }
    ).happyDOM.setURL("http://localhost:3000/portal/finance/donations");
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("says nothing while the session is fresh", () => {
    render(<IdleTimeout />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  test("warns before signing out", async () => {
    seedWarning();
    render(<IdleTimeout />);

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Still there?")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Stay signed in" }),
    ).toBeInTheDocument();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  test("Stay signed in dismisses the warning without signing out", async () => {
    const user = userEvent.setup();
    seedWarning();
    render(<IdleTimeout />);

    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Stay signed in" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(signOutMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test("signs out on expiry and says why, keeping the way back", async () => {
    seedExpired();
    render(<IdleTimeout />);

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    const target = replaceMock.mock.calls[0]?.[0] ?? "";
    expect(target).toContain("/portal/login?");
    expect(target).toContain("reason=idle");
    // So signing back in lands where they left off rather than the dashboard.
    expect(target).toContain(
      `next=${encodeURIComponent("/portal/finance/donations")}`,
    );
    expect(refreshMock).toHaveBeenCalled();
  });

  test("any interaction at all calls off the sign-out", async () => {
    seedWarning();
    render(<IdleTimeout />);
    await screen.findByRole("alertdialog");

    // Reaching for the button is already enough -- which is why the dialog
    // carries no second "log out now" action: the press that reached it would
    // have dismissed the warning before the click landed.
    fireEvent.keyDown(window, { key: "Shift" });

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(signOutMock).not.toHaveBeenCalled();
  });

  test("follows another tab out without signing out again", async () => {
    render(<IdleTimeout />);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SIGNED_OUT_KEY,
        newValue: String(Date.now()),
      }),
    );

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith("/portal/login"),
    );
    // The tab that started it owns the sign-out; this one only redirects.
    expect(signOutMock).not.toHaveBeenCalled();
  });

  test("only signs out once when expiry and a broadcast collide", async () => {
    seedExpired();
    render(<IdleTimeout />);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SIGNED_OUT_KEY,
        newValue: String(Date.now()),
      }),
    );

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock.mock.calls[0]?.[0]).toContain("reason=idle");
  });

  test("unsubscribes from auth changes on unmount", () => {
    const { unmount } = render(<IdleTimeout />);
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});
