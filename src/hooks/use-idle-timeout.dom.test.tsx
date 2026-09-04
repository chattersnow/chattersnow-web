import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  mock,
  test,
} from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  ACTIVITY_WRITE_INTERVAL_MS,
  LAST_ACTIVITY_KEY,
} from "@/lib/auth/idle-timeout";
import { useIdleTimeout } from "./use-idle-timeout";

const IDLE_MS = 30 * 60_000;
const WARNING_MS = 2 * 60_000;

function Harness({
  onExpire,
  enabled = true,
}: {
  onExpire: () => void;
  enabled?: boolean;
}) {
  const { warning, msRemaining, extend } = useIdleTimeout({
    onExpire,
    idleMs: IDLE_MS,
    warningMs: WARNING_MS,
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

/**
 * Bun's fake timers recompute `Date.now()` as base + total advance, so an
 * `advanceTimersByTime` after a `setSystemTime` silently discards the jump.
 * Every test here uses one or the other, never both.
 */
async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

function phase() {
  return screen.getByText(/warning|quiet/).textContent;
}

function stored() {
  return localStorage.getItem(LAST_ACTIVITY_KEY);
}

/**
 * Simulates storage being unavailable the way browsers actually do it: the
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
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    localStorage.clear();
  });

  test("warns at the threshold and expires at the timeout", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);

    expect(phase()).toBe("quiet");

    await advance(IDLE_MS - WARNING_MS - 1_000);
    expect(phase()).toBe("quiet");

    await advance(1_000);
    expect(phase()).toBe("warning");
    expect(onExpire).not.toHaveBeenCalled();

    await advance(WARNING_MS);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test("does not expire twice once the deadline is well past", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);

    await advance(IDLE_MS + 60 * 60_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test("activity dismisses the warning and buys a full new window", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);

    await advance(IDLE_MS - 60_000);
    expect(phase()).toBe("warning");

    await act(async () => {
      fireEvent.keyDown(window, { key: "a" });
    });
    expect(phase()).toBe("quiet");

    await advance(IDLE_MS - WARNING_MS - 1_000);
    expect(phase()).toBe("quiet");
    expect(onExpire).not.toHaveBeenCalled();
  });

  test("the Stay button resets the clock", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);

    await advance(IDLE_MS - 30_000);
    expect(phase()).toBe("warning");

    await act(async () => {
      screen.getByRole("button", { name: "Stay" }).click();
    });
    expect(phase()).toBe("quiet");

    await advance(IDLE_MS - 1_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  test("throttles storage writes during a pointer storm", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);
    const seeded = stored();

    // Spread across the throttle window rather than fired in one tick: with
    // fake timers a same-tick storm would rewrite the identical timestamp, so
    // the assertion would hold even with no throttle at all.
    for (let i = 0; i < 10; i += 1) {
      await advance(1_000);
      await act(async () => {
        fireEvent.pointerMove(window, { clientX: i });
      });
    }
    expect(stored()).toBe(seeded);

    // And once the window has passed, the next movement does write through.
    await advance(ACTIVITY_WRITE_INTERVAL_MS);
    await act(async () => {
      fireEvent.pointerMove(window, { clientX: 99 });
    });
    expect(stored()).not.toBe(seeded);
  });

  test("writes through as soon as the warning is dismissed", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);
    await advance(IDLE_MS - 30_000);
    expect(phase()).toBe("warning");
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

    await advance(IDLE_MS - 30_000);
    expect(phase()).toBe("warning");

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LAST_ACTIVITY_KEY,
          newValue: String(Date.now()),
        }),
      );
    });

    expect(phase()).toBe("quiet");
    await advance(29 * 60_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  test.each([
    ["a cleared key", null],
    ["a corrupt value", "banana"],
    ["a stamp older than ours", "1"],
  ])("ignores %s from another tab", async (_label, newValue) => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);
    await advance(IDLE_MS - 30_000);

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

  test("expires on wake from sleep rather than granting another window", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);

    // No timer advance at all: the machine slept, the timer never fired, and
    // the first thing that runs on resume has to notice the real elapsed time.
    await act(async () => {
      jest.setSystemTime(new Date(Date.now() + IDLE_MS + 60_000));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test("returning to the tab is not itself activity", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);

    await advance(IDLE_MS - 60_000);
    expect(phase()).toBe("warning");

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Alt-tabbing back must not silently renew the session.
    expect(phase()).toBe("warning");
  });

  test("adopts an existing stamp instead of granting a fresh window", async () => {
    localStorage.setItem(
      LAST_ACTIVITY_KEY,
      String(Date.now() - (IDLE_MS - 30_000)),
    );
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} />);

    expect(phase()).toBe("warning");
  });

  test("stops completely once unmounted", async () => {
    const onExpire = mock(() => {});
    const { unmount } = render(<Harness onExpire={onExpire} />);
    unmount();

    await advance(IDLE_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });

  test("does nothing when disabled", async () => {
    const onExpire = mock(() => {});
    render(<Harness onExpire={onExpire} enabled={false} />);

    await advance(IDLE_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
    expect(phase()).toBe("quiet");
  });

  test("keeps working when storage is unavailable", async () => {
    const onExpire = mock(() => {});

    await withBrokenStorage(async () => {
      render(<Harness onExpire={onExpire} />);

      // Degrades to a single-tab, in-memory timeout rather than taking the
      // whole portal shell down with it.
      await advance(IDLE_MS - WARNING_MS);
      expect(phase()).toBe("warning");
      await advance(WARNING_MS);
      expect(onExpire).toHaveBeenCalledTimes(1);
    });
  });
});
