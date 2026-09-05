import { afterEach, describe, expect, test } from "bun:test";
import { act, render } from "@testing-library/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

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

function renderTable(props: React.ComponentProps<typeof Table> = {}) {
  globalThis.ResizeObserver =
    CapturingResizeObserver as unknown as typeof ResizeObserver;

  const { container } = render(
    <Table {...props}>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Snowboard</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
  const wrapper = container.querySelector<HTMLElement>(
    '[data-slot="table-container"]',
  )!;
  return { wrapper, table: container.querySelector<HTMLElement>("table")! };
}

/**
 * Stands in for the layout happy-dom never performs. The table is measured
 * rather than the container: the container stops reporting its own overflow
 * as soon as it stops scrolling, so a self-measurement would latch on.
 */
function measure(
  { wrapper, table }: { wrapper: HTMLElement; table: HTMLElement },
  widths: { tableWidth: number; clientWidth: number },
) {
  Object.defineProperty(wrapper, "clientWidth", {
    configurable: true,
    get: () => widths.clientWidth,
  });
  table.getBoundingClientRect = () => ({ width: widths.tableWidth }) as DOMRect;
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
    const rendered = renderTable();
    measure(rendered, { tableWidth: 900, clientWidth: 390 });
    expect(rendered.wrapper.getAttribute("tabindex")).toBe("0");
  });

  test("stays out of the tab order when it fits", () => {
    const rendered = renderTable();
    measure(rendered, { tableWidth: 900, clientWidth: 900 });
    expect(rendered.wrapper.getAttribute("tabindex")).toBeNull();
  });

  test("gives up the tab stop when the overflow goes away", () => {
    const rendered = renderTable();
    measure(rendered, { tableWidth: 900, clientWidth: 390 });
    measure(rendered, { tableWidth: 900, clientWidth: 900 });
    expect(rendered.wrapper.getAttribute("tabindex")).toBeNull();
  });

  test("scrolls before it has measured anything", () => {
    // The server renders this too, and a wide table on a phone would be
    // clipped and unreachable between paint and the first measurement.
    const { wrapper } = renderTable();
    expect(wrapper.className).toContain("overflow-x-auto");
  });

  test("drops the overflow wrapper once the table fits", () => {
    // What makes a sticky header possible at all: `overflow-x: auto` computes
    // `overflow-y` to `auto`, so the wrapper is a scroll container, and a
    // sticky header pins to the nearest one -- this one, which never scrolls.
    const rendered = renderTable({ stickyHeader: "page" });
    measure(rendered, { tableWidth: 900, clientWidth: 900 });
    expect(rendered.wrapper.className).not.toContain("overflow-x-auto");
    expect(rendered.table.className).toContain("[&_thead_th]:sticky");
    expect(rendered.table.className).toContain(
      "[&_thead_th]:top-(--portal-header-height)",
    );
  });

  test("leaves the header unstuck while the table scrolls sideways", () => {
    // Not merely cosmetic: a top offset inside a wrapper that never scrolls
    // vertically resolves to the offset itself, which would park the header
    // partway down the table on top of the first rows.
    const rendered = renderTable({ stickyHeader: "page" });
    measure(rendered, { tableWidth: 900, clientWidth: 390 });
    expect(rendered.table.className).not.toContain("[&_thead_th]:sticky");
  });

  test("pins to the container, not the page, inside a sheet", () => {
    const rendered = renderTable({ stickyHeader: "container" });
    measure(rendered, { tableWidth: 900, clientWidth: 900 });
    expect(rendered.table.className).toContain("[&_thead_th]:top-0");
    expect(rendered.table.className).toContain("[&_thead_th]:bg-popover");
  });

  test("lifts the corner cell over the pinned first column", () => {
    // Both stickies apply to that one cell; the body's pinned column comes
    // later in the DOM and would otherwise paint over the header.
    const rendered = renderTable({
      stickyHeader: "page",
      stickyFirstColumn: true,
    });
    measure(rendered, { tableWidth: 900, clientWidth: 900 });
    expect(rendered.table.className).toContain("[&_thead_th:first-child]:z-30");
  });
});
