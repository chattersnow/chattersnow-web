import { afterEach, describe, expect, test } from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import { expectToast, renderWithToaster } from "../../../test/toast-testing";
import { OfflineBanner } from "./offline-banner";

/**
 * `navigator.onLine` is read-only, so the suite swaps the descriptor rather
 * than assigning to it, and puts it back afterwards.
 */
function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
}

function goOffline() {
  setOnline(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}

function goOnline() {
  setOnline(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

afterEach(() => {
  setOnline(true);
});

const BANNER = /you are offline/i;

describe("OfflineBanner", () => {
  test("shows nothing while the connection holds", () => {
    setOnline(true);
    render(<OfflineBanner />);
    expect(screen.queryByText(BANNER)).toBeNull();
  });

  test("appears as soon as the connection drops, and leaves when it returns", async () => {
    setOnline(true);
    render(<OfflineBanner />);

    goOffline();
    await waitFor(() => expect(screen.getByText(BANNER)).toBeTruthy());

    goOnline();
    await waitFor(() => expect(screen.queryByText(BANNER)).toBeNull());
  });

  test("is already up when the portal is opened with no connection", async () => {
    setOnline(false);
    render(<OfflineBanner />);
    await waitFor(() => expect(screen.getByText(BANNER)).toBeTruthy());
  });

  test("refuses a submit while offline rather than letting it look sent", async () => {
    setOnline(true);
    let submitted = false;
    renderWithToaster(
      <>
        <OfflineBanner />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitted = true;
          }}
        >
          <button type="submit">Record donation</button>
        </form>
      </>,
    );

    goOffline();
    await waitFor(() => expect(screen.getByText(BANNER)).toBeTruthy());
    act(() => {
      screen.getByRole("button", { name: "Record donation" }).click();
    });

    expect(submitted).toBe(false);
    await expectToast("No connection.");
  });

  test("lets a submit through once the connection is back", async () => {
    setOnline(true);
    let submitted = false;
    renderWithToaster(
      <>
        <OfflineBanner />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitted = true;
          }}
        >
          <button type="submit">Record donation</button>
        </form>
      </>,
    );

    goOffline();
    await waitFor(() => expect(screen.getByText(BANNER)).toBeTruthy());
    goOnline();
    await waitFor(() => expect(screen.queryByText(BANNER)).toBeNull());

    act(() => {
      screen.getByRole("button", { name: "Record donation" }).click();
    });
    expect(submitted).toBe(true);
  });
});
