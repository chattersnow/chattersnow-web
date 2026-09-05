import { afterEach, describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { Table, TableBody, TableCell, TableRow } from "./table";

/**
 * happy-dom does no layout, so the widths the container measures and the
 * observer that triggers the measurement both have to be supplied here.
 */
class ImmediateResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    this.callback([], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const originalResizeObserver = globalThis.ResizeObserver;

function renderTableWith(widths: { scrollWidth: number; clientWidth: number }) {
  for (const [name, value] of Object.entries(widths)) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get: () => value,
    });
  }
  globalThis.ResizeObserver =
    ImmediateResizeObserver as unknown as typeof ResizeObserver;

  const { container } = render(
    <Table>
      <TableBody>
        <TableRow>
          <TableCell>Snowboard</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
  return container.querySelector('[data-slot="table-container"]')!;
}

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  for (const name of ["scrollWidth", "clientWidth"]) {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  }
});

describe("Table", () => {
  test("takes a tab stop while the container overflows", () => {
    // Nothing inside a table is focusable, so without this a keyboard user
    // cannot scroll to the columns past the right edge.
    const container = renderTableWith({ scrollWidth: 900, clientWidth: 390 });
    expect(container.getAttribute("tabindex")).toBe("0");
  });

  test("stays out of the tab order when it fits", () => {
    const container = renderTableWith({ scrollWidth: 900, clientWidth: 900 });
    expect(container.getAttribute("tabindex")).toBeNull();
  });
});
