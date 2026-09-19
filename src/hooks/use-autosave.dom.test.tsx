import { describe, expect, mock, test } from "bun:test";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { useAutosave } from "./use-autosave";

/**
 * Real timers, durations dialled down -- the same arrangement as
 * `use-idle-timeout.dom.test.tsx`, and for the reason spelled out there:
 * `jest.useFakeTimers()` patches the global timer functions for the whole
 * runtime and took unrelated suites down with it once the full file set was
 * running together.
 */
const DELAY_MS = 10;
const RETRY_MS = 20;

/** Comfortably past every transition here, so a loaded runner isn't a failure. */
const SETTLE = { timeout: 4_000 };

function Harness({
  save,
  delayMs = DELAY_MS,
  retryBaseMs = RETRY_MS,
  enabled = true,
  onFlushed,
}: {
  save: (value: string) => Promise<object>;
  delayMs?: number;
  retryBaseMs?: number;
  enabled?: boolean;
  onFlushed?: (saved: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const autosave = useAutosave<string>({
    save,
    delayMs,
    retryBaseMs,
    enabled,
  });

  return (
    <>
      <input
        aria-label="value"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          autosave.queue(event.target.value);
        }}
      />
      <p>{`status: ${autosave.status}`}</p>
      <p>{`dirty: ${autosave.dirty}`}</p>
      <p>{`error: ${autosave.errorMessage ?? "none"}`}</p>
      <button
        type="button"
        onClick={() => {
          autosave.flush().then((saved) => onFlushed?.(saved));
        }}
      >
        Flush
      </button>
    </>
  );
}

function status() {
  return screen.getByText(/^status: /).textContent;
}

function dirty() {
  return screen.getByText(/^dirty: /).textContent;
}

function errorText() {
  return screen.getByText(/^error: /).textContent;
}

async function type(value: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText("value"), { target: { value } });
  });
}

async function sleep(ms: number) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

/** A save the test resolves by hand, to hold a request open. */
function deferred() {
  let resolve: (value: object) => void = () => {};
  const promise = new Promise<object>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function untilSaved() {
  return waitFor(() => expect(status()).toBe("status: saved"), SETTLE);
}

describe("useAutosave", () => {
  test("coalesces a burst of keystrokes into one save of the last value", async () => {
    const save = mock(async () => ({ success: true }));
    render(<Harness save={save} />);

    await type("a");
    await type("ab");
    await type("abc");
    expect(save).not.toHaveBeenCalled();
    expect(dirty()).toBe("dirty: true");

    await untilSaved();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith("abc");
    expect(dirty()).toBe("dirty: false");
  });

  test("keeps one request in flight and follows it with the newest value", async () => {
    const first = deferred();
    const save = mock((value: string) =>
      value === "a" ? first.promise : Promise.resolve({ success: true }),
    );
    render(<Harness save={save} />);

    await type("a");
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1), SETTLE);
    expect(status()).toBe("status: saving");

    // Typed while that request is open. Neither may start a second concurrent
    // save: out-of-order Server Action responses would resurrect stale text.
    await type("ab");
    await type("abc");
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve({ success: true });
    });

    await untilSaved();
    // Exactly one follow-up, carrying the newest value rather than each
    // intermediate one.
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("abc");
  });

  /**
   * These two were one test, and it was the flake that kept `development` red
   * (#1283). It read the failure state off the DOM *after* a `waitFor` had
   * seen it -- but that state is only on screen for `retryBaseMs`, 20ms here,
   * and the assertion that followed ran after React Testing Library's own
   * act-unwind. On a contended CI runner that unwind outlasted the backoff, so
   * the retry had already landed and `dirty` read `false` where the test
   * expected `true`.
   *
   * Widening the window would only have moved the race. Neither test below has
   * one: the first gives the retry no schedule to arrive on, and the second
   * asserts nothing that a retry can undo -- a mock's call count only goes up,
   * and the attempt it counts is held open until the test resolves it.
   */
  test("holds the value when a save fails", async () => {
    const failing = deferred();
    const save = mock(() => failing.promise);
    // No backoff can fire while the assertions run, so the failure state is
    // observed rather than raced.
    render(<Harness save={save} retryBaseMs={60_000} />);

    await type("abc");
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1), SETTLE);

    await act(async () => {
      failing.resolve({ error: "Server said no." });
    });

    expect(status()).toBe("status: error");
    // The text on screen is the only copy of it, so the value stays queued and
    // the surface stays dirty -- which is what keeps `beforeunload` armed.
    expect(dirty()).toBe("dirty: true");
    expect(errorText()).toBe("error: Server said no.");
  });

  test("retries the held value after the backoff", async () => {
    const first = deferred();
    const second = deferred();
    let attempts = 0;
    const save = mock((_value: string) => {
      attempts += 1;
      return attempts === 1 ? first.promise : second.promise;
    });
    render(<Harness save={save} />);

    await type("abc");
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1), SETTLE);
    await act(async () => {
      first.resolve({ error: "Server said no." });
    });

    // The retry is the assertion, and a call count cannot be taken back --
    // unlike the `status: error` this used to watch for, which the retry
    // itself ends.
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2), SETTLE);
    expect(save).toHaveBeenLastCalledWith("abc");

    await act(async () => {
      second.resolve({ success: true });
    });
    await untilSaved();
    expect(dirty()).toBe("dirty: false");
    expect(errorText()).toBe("error: none");
  });

  test("retries immediately on the next edit rather than waiting out the backoff", async () => {
    let attempts = 0;
    const save = mock(async () => {
      attempts += 1;
      return attempts === 1 ? { error: "Server said no." } : { success: true };
    });
    // A backoff long enough that the test can only pass through the edit path.
    render(<Harness save={save} retryBaseMs={60_000} />);

    await type("a");
    await waitFor(() => expect(status()).toBe("status: error"), SETTLE);

    await type("ab");
    await untilSaved();
    expect(save).toHaveBeenLastCalledWith("ab");
  });

  test("flush() saves without waiting for the quiet period", async () => {
    const save = mock(async () => ({ success: true }));
    const onFlushed = mock((_saved: boolean) => {});
    // Long enough that a debounced save cannot be what fires here.
    render(<Harness save={save} delayMs={60_000} onFlushed={onFlushed} />);

    await type("abc");
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByRole("button", { name: "Flush" }).click();
    });

    await untilSaved();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith("abc");
    await waitFor(() => expect(onFlushed).toHaveBeenCalledWith(true), SETTLE);
  });

  test("flush() reports a failure, so a caller can decline to navigate away", async () => {
    const save = mock(async () => ({ error: "Server said no." }));
    const onFlushed = mock((_saved: boolean) => {});
    render(<Harness save={save} delayMs={60_000} onFlushed={onFlushed} />);

    await type("abc");
    await act(async () => {
      screen.getByRole("button", { name: "Flush" }).click();
    });

    await waitFor(() => expect(onFlushed).toHaveBeenCalledWith(false), SETTLE);
  });

  test("flushes what is queued on unmount", async () => {
    const save = mock(async () => ({ success: true }));
    // The case this hook exists for: Base UI unmounts the panel of the tab you
    // switch away from, taking the textarea with it.
    const { unmount } = render(<Harness save={save} delayMs={60_000} />);

    await type("abc");
    expect(save).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1), SETTLE);
    expect(save).toHaveBeenLastCalledWith("abc");
  });

  test("never saves while disabled", async () => {
    const save = mock(async () => ({ success: true }));
    render(<Harness save={save} enabled={false} />);

    await type("abc");
    await sleep(DELAY_MS * 5);

    expect(save).not.toHaveBeenCalled();
    expect(status()).toBe("status: idle");
    expect(dirty()).toBe("dirty: false");
  });

  // Same treatment as the two above, and for the same reason: this read the
  // error message out of a window the backoff was already closing. The retry
  // itself is covered there; what is left here is the surface a rejection
  // produces, asserted where nothing is due to fire.
  test("treats a thrown action as a failure rather than a lost edit", async () => {
    const attempt = deferred();
    const save = mock(async () => {
      await attempt.promise;
      throw new Error("network");
    });
    render(<Harness save={save} retryBaseMs={60_000} />);

    await type("abc");
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1), SETTLE);

    await act(async () => {
      attempt.resolve({});
    });

    expect(status()).toBe("status: error");
    expect(errorText()).toBe("error: Couldn't save. Check your connection.");
    // Nothing readable came back, but the edit is still here to be retried.
    expect(dirty()).toBe("dirty: true");
  });
});
