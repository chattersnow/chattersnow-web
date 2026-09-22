import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LAST_ACTIVITY_KEY } from "@/lib/auth/idle-timeout";
import { useIdleTimeout } from "./use-idle-timeout";

/**
 * Real timers on purpose, with the durations dialled down.
 *
 * `jest.useFakeTimers()` works in a file on its own but patches the global
 * timer functions for the whole runtime, and it took unrelated suites down
 * with it once all 148 test files were running together -- innocent tests
 * timing out at exactly 5s, and `useRealTimers()` reporting that fake timers
 * were never active. Nothing else in this repo fakes timers, and this is why.
 *
 * So the clock is left alone and the thresholds are shrunk instead. Anything
 * that would need a clock jump (a laptop waking after an hour) is expressed as
 * a stale stored stamp, which is exactly the state such a machine wakes up in.
 */
const IDLE_MS = 900;
const WARNING_MS = 450;
const WRITE_MS = 100;

// Comfortably past the longest transition, so a loaded CI runner doesn't fail
// a test that was merely slow.
const SETTLE = { timeout: 4_000 };

function Harness({
  onExpire,
  enabled = true,
  writeIntervalMs = WRITE_MS,
}: {
  onExpire: () => void;
  enabled?: boolean;
  /** Overridable so a test can assert inside the throttle window without
   * racing it -- see "holds every write of a pointer storm" (#1294). */
  writeIntervalMs?: number;
}) {
  const { warning, msRemaining, extend } = useIdleTimeout({
    onExpire,
    idleMs: IDLE_MS,
    warningMs: WARNING_MS,
    writeIntervalMs,
    enabled,
  });
  return (
    <>
      <p>{warning ? "warning" : "quiet"}</p>
      <p>remaining: {msRemaining}</p>
      <button type="button" onClick={extend}>
        Stay
      </button>
    </>
  );
}

function phase() {
  return screen.getByText(/warning|quiet/).textContent;
}

function stored() {
  return localStorage.getItem(LAST_ACTIVITY_KEY);
}

async function sleep(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** Waits for the warning dialog's state to appear. */
function untilWarning() {
  return waitFor(() => expect(phase()).toBe("warning"), SETTLE);
}

/** Seeds the stamp another tab (or a pre-sleep session) would have left. */
function seedStamp(ageMs: number) {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now() - ageMs));
}

/**
 * Storage being unavailable the way browsers actually do it: the
 * `localStorage` getter itself throws (Safari private mode, site data
 * blocked). A `jest.spyOn(Storage.prototype, ...)` with a throwing
 * implementation looks like it works here but is silently ignored, which makes
 * for a test that passes without exercising anything.
 */
function withBrokenStorage(run: () => Promise<void>) {
  const real = window.localStorage;
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError");
    },
  });
  return run().finally(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      writable: true,
      value: real,
    });
  });
}

describe("useIdleTimeout", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  test("warns first, then expires", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);

    expect(phase()).toBe("quiet");
    await untilWarning();
    expect(onExpire).not.toHaveBeenCalled();

    await waitFor(() => expect(onExpire).toHaveBeenCalledTimes(1), SETTLE);
  });

  test("expires only once, however long it is left", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);

    await waitFor(() => expect(onExpire).toHaveBeenCalledTimes(1), SETTLE);
    await sleep(IDLE_MS);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test("activity dismisses the warning and buys a full new window", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);
    await untilWarning();

    await act(async () => {
      fireEvent.keyDown(window, { key: "a" });
    });
    expect(phase()).toBe("quiet");

    /**
     * The warning coming back is what proves the clock restarted, and it is a
     * fact the reset produces rather than a window the test has to survive
     * (#1294). This used to sleep to just short of the deadline the original
     * window would have had and assert `onExpire` had not fired -- a negative
     * assertion 300ms from a deadline something else was counting down to.
     * A clock that had not restarted would expire here instead of warning
     * again, so the wait below fails in exactly the case the sleep was for.
     */
    await untilWarning();
    expect(onExpire).not.toHaveBeenCalled();
  });

  test("the Stay button resets the clock", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);
    await untilWarning();

    await act(async () => {
      screen.getByRole("button", { name: "Stay" }).click();
    });
    expect(phase()).toBe("quiet");

    // The returning warning, for the reason given above (#1294).
    await untilWarning();
    expect(onExpire).not.toHaveBeenCalled();
  });

  /**
   * Split in two (#1294). The throttle half used to assert inside the real
   * 100ms window, which started at render and had to cover mount, a
   * `localStorage` read and 50 synthetic `pointerMove` dispatches through
   * happy-dom's capture-phase listeners. Reproduced at 12-in-20 with
   * `WRITE_MS` at 1: the stamp had advanced by a millisecond and the storm was
   * blamed for a write the clock had earned. The window is now long enough
   * that nothing can close it, so the assertion is about the throttle rather
   * than about how fast the runner is.
   */
  test("holds every write of a pointer storm", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} writeIntervalMs={60_000} />);
    const seeded = stored();

    await act(async () => {
      for (let i = 0; i < 50; i += 1) {
        fireEvent.pointerMove(window, { clientX: i });
      }
    });

    expect(stored()).toBe(seeded);
  });

  test("writes through once the throttle window has passed", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);
    const seeded = stored();

    // Sleeping *past* a threshold and asserting the write happened is the safe
    // direction: an overrun cannot turn this green when the code is wrong.
    await sleep(WRITE_MS + 50);
    await act(async () => {
      fireEvent.pointerMove(window, { clientX: 99 });
    });

    expect(stored()).not.toBe(seeded);
  });

  test("writes through as soon as the warning is dismissed", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);
    await untilWarning();
    const seeded = stored();

    await act(async () => {
      fireEvent.pointerMove(window, { clientX: 1 });
    });

    // The throttle window is long gone by the time a warning can appear, so
    // the movement that dismisses the dialog reaches the other tabs at once.
    expect(stored()).not.toBe(seeded);
    expect(phase()).toBe("quiet");
  });

  test("activity in another tab keeps this one alive", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);
    await untilWarning();

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LAST_ACTIVITY_KEY,
          newValue: String(Date.now()),
        }),
      );
    });

    expect(phase()).toBe("quiet");
    // The returning warning, for the reason given above (#1294).
    await untilWarning();
    expect(onExpire).not.toHaveBeenCalled();
  });

  test.each([
    ["a cleared key", null],
    ["a corrupt value", "banana"],
    ["a stamp older than ours", "1"],
  ])("ignores %s from another tab", async (_label, newValue) => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);
    await untilWarning();

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: LAST_ACTIVITY_KEY, newValue }),
      );
    });

    // None of these may shorten the session: Number(null) is 0, which would
    // read as a 1970 stamp and sign every tab out at once.
    expect(phase()).toBe("warning");
    expect(onExpire).not.toHaveBeenCalled();
  });

  test("expires at once when the stored stamp is already past the deadline", async () => {
    // The state a slept-through laptop wakes up in: no timer ever fired, and
    // the only evidence of the lost time is the stamp itself.
    seedStamp(IDLE_MS * 3);
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);

    await waitFor(() => expect(onExpire).toHaveBeenCalledTimes(1), SETTLE);
  });

  test("adopts an existing stamp instead of granting a fresh window", async () => {
    seedStamp(IDLE_MS - WARNING_MS + 50);
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);

    // Straight into the warning: opening a new tab must not reset the clock.
    expect(phase()).toBe("warning");
  });

  test("returning to the tab is not itself activity", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);
    await untilWarning();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Alt-tabbing back must not silently renew the session.
    expect(phase()).toBe("warning");
  });

  test("stops completely once unmounted", async () => {
    const onExpire = mock(() => {});
    const { unmount } = render(<Harness onExpire={onExpire} />);
    unmount();

    await sleep(IDLE_MS + 300);
    expect(onExpire).not.toHaveBeenCalled();
  });

  test("does nothing when disabled", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} enabled={false} />);

    await sleep(IDLE_MS + 300);
    expect(onExpire).not.toHaveBeenCalled();
    expect(phase()).toBe("quiet");
  });

  test("keeps working when storage is unavailable", async () => {
    const onExpire = mock(() => {});

    await withBrokenStorage(async () => {
      render(<Harness onExpire={onExpire} />);

      // Degrades to a single-tab, in-memory timeout rather than taking the
      // whole portal shell down with it.
      await untilWarning();
      await waitFor(() => expect(onExpire).toHaveBeenCalledTimes(1), SETTLE);
    });
  });
});
