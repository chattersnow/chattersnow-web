import { afterEach, describe, expect, test } from "bun:test";
import { act, render } from "@testing-library/react";
import { Table, TableBody, TableCell, TableRow } from "./table";

/**
 * happy-dom does no layout and its ResizeObserver is a stub, so both halves of
 * the measurement have to be supplied here: the widths, and the callback that
 * reads them. The observer is captured rather than fired on `observe`, so the
 * test decides when the measurement happens instead of racing the effect.
 */
let notify: (() => void) | undefined;

class CapturingResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    notify = () => this.callback([], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const originalResizeObserver = globalThis.ResizeObserver;

function renderTable() {
  globalThis.ResizeObserver =
    CapturingResizeObserver as unknown as typeof ResizeObserver;

  const { container } = render(
    <Table>
      <TableBody>
        <TableRow>
          <TableCell>Snowboard</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
  return container.querySelector<HTMLElement>('[data-slot="table-container"]')!;
}

/** Stands in for the layout happy-dom never performs. */
function measure(
  element: HTMLElement,
  widths: { scrollWidth: number; clientWidth: number },
) {
  for (const [name, value] of Object.entries(widths)) {
    Object.defineProperty(element, name, {
      configurable: true,
      get: () => value,
    });
  }
  act(() => notify?.());
}

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  notify = undefined;
});

describe("Table", () => {
  test("takes a tab stop while the container overflows", () => {
    // Nothing inside a table is focusable, so without this a keyboard user
    // cannot scroll to the columns past the right edge.
    const container = renderTable();
    measure(container, { scrollWidth: 900, clientWidth: 390 });
    expect(container.getAttribute("tabindex")).toBe("0");
  });

  test("stays out of the tab order when it fits", () => {
    const container = renderTable();
    measure(container, { scrollWidth: 900, clientWidth: 900 });
    expect(container.getAttribute("tabindex")).toBeNull();
  });

  test("gives up the tab stop when the overflow goes away", () => {
    const container = renderTable();
    measure(container, { scrollWidth: 900, clientWidth: 390 });
    measure(container, { scrollWidth: 900, clientWidth: 900 });
    expect(container.getAttribute("tabindex")).toBeNull();
  });
});
