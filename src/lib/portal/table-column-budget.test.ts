// Every portal table has to survive a 390px phone (#1090).
//
// `hideBelow` on a column is what carries a wide table onto a phone, and it
// works -- Expenses drops from nine columns to Description / Amount / Status
// and reads cleanly. The problem was never the capability, it was adoption:
// thirteen of the portal's seventy-odd tables set it, and everything else fell
// back to a silent `overflow-x-auto`. Twenty tables fixed by hand is worth
// less than the rule that catches the twenty-first, which is what this is.
//
// Like nav-guards.test.ts and module-catalog.test.ts, it reads the source on
// disk rather than a constant: column lists are spread over forty-odd
// components and nothing imports them anywhere they could be counted.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const APP_ROOT = join(import.meta.dir, "../../app/portal/(app)");

/**
 * How many columns a phone may show at once.
 *
 * Three plus the row's own actions is what fits 390px without the reader
 * scrolling sideways to find out whether there is anything there. Actions
 * columns are `srOnlyLabel` icon buttons and don't count against it -- the
 * Expenses table reads as three columns "plus the preview eye".
 */
const COLUMN_BUDGET = 3;

/**
 * Tables that genuinely cannot drop a column, each with the reason.
 *
 * The list is the point as much as the rule. A reconciliation view or a fixed
 * order aggregate should say once, in code, that it has been looked at --
 * otherwise it is indistinguishable from the ones nobody has looked at yet.
 * A stale entry fails too: an exemption that is no longer needed is a claim
 * about the table that has stopped being true.
 */
const EXEMPT: Record<string, string> = {
  "finance/reports/report-tables.tsx":
    "A reconciliation row: income, paid spend and net only mean anything " +
    "read across, and dropping one leaves a subtraction the reader cannot " +
    "check.",
  "calendar/import/csv-import-panel.tsx":
    "The preview of the rows about to be imported. Hiding a column would " +
    "hide a value the reader is being asked to approve.",
};

type Column = {
  key: string;
  hideBelow: string | null;
  srOnlyLabel: boolean;
};

/**
 * Source with every string, template literal and comment replaced by spaces,
 * offsets preserved.
 *
 * Columns carry `render` functions full of JSX, and a `label: "Amount"` inside
 * one of those would otherwise be counted as a column of its own. Blanking
 * rather than deleting keeps every index usable against the original text.
 */
function blankLiterals(source: string): string {
  const out = source.split("");
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      while (i < stop) {
        if (source[i] !== "\n") out[i] = " ";
        i++;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      out[i] = " ";
      i++;
      while (i < source.length) {
        if (source[i] === "\\") {
          out[i] = " ";
          if (i + 1 < source.length) out[i + 1] = " ";
          i += 2;
          continue;
        }
        if (source[i] === char) {
          out[i] = " ";
          i++;
          break;
        }
        if (source[i] !== "\n") out[i] = " ";
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Index of the closing bracket matching the one at `start`. */
function matchBracket(
  masked: string,
  start: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  for (let i = start; i < masked.length; i++) {
    if (masked[i] === open) depth++;
    else if (masked[i] === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index just past the `<...>` opening at `start`, or -1. */
function matchAngle(masked: string, start: number): number {
  let depth = 0;
  for (let i = start; i < masked.length; i++) {
    if (masked[i] === "<") depth++;
    else if (masked[i] === ">") {
      depth--;
      if (depth === 0) return i + 1;
    } else if (masked[i] === ";" && depth === 0) return -1;
  }
  return -1;
}

/** The column objects directly inside the array literal `[start, end]`. */
function columnsInArray(
  source: string,
  masked: string,
  start: number,
  end: number,
): Column[] {
  const columns: Column[] = [];
  let depth = 0;
  for (let i = start; i <= end; i++) {
    const char = masked[i];
    if (char === "[" || char === "{" || char === "(") {
      depth++;
      // Depth 2 is an object sitting directly in the array: anything deeper
      // belongs to a `render` or a nested conditional and is not a column of
      // its own. A conditional actions column is therefore invisible here,
      // which is harmless -- actions never count against the budget anyway.
      if (char === "{" && depth === 2) {
        const close = matchBracket(masked, i, "{", "}");
        const body = source.slice(i, close + 1);
        const key = /^\s*\{\s*key:\s*["']([^"']+)["']/.exec(body)?.[1];
        if (key) {
          columns.push({
            key,
            hideBelow: /\bhideBelow:\s*["'](\w+)["']/.exec(body)?.[1] ?? null,
            srOnlyLabel: /\bsrOnlyLabel:\s*true/.test(body),
          });
        }
        i = close;
        depth--;
      }
    } else if (char === "]" || char === "}" || char === ")") depth--;
  }
  return columns;
}

/** Every `PortalDataTableColumn<...>[]` literal in one file. */
function columnListsIn(source: string): Column[][] {
  const masked = blankLiterals(source);
  const lists: Column[][] = [];
  const annotation = /PortalDataTableColumn\s*</g;
  let match: RegExpExecArray | null;
  while ((match = annotation.exec(masked))) {
    const afterGeneric = matchAngle(masked, masked.indexOf("<", match.index));
    if (afterGeneric === -1) continue;
    // Only an array type annotates a column list; a bare
    // `PortalDataTableColumn<T>` is a single column or an import.
    const arraySuffix = /^\s*\[\s*\]/.exec(masked.slice(afterGeneric));
    if (!arraySuffix) continue;
    const open = masked.indexOf("[", afterGeneric + arraySuffix[0].length);
    if (open === -1) continue;
    // Only `>`, `(`, `=>` and whitespace may stand between the annotation and
    // the literal -- `useMemo<C[]>(() => [`, `const c: C[] = [`. Anything else
    // means this annotation doesn't own that bracket.
    const between = masked.slice(afterGeneric + arraySuffix[0].length, open);
    if (!/^[\s>=(),]*$/.test(between)) continue;
    const close = matchBracket(masked, open, "[", "]");
    if (close === -1) continue;
    lists.push(columnsInArray(source, masked, open, close));
    annotation.lastIndex = close;
  }
  return lists;
}

function portalTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return portalTsxFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

/** Every portal table, by the path the exemption list spells it with. */
function portalTables(): { file: string; columns: Column[] }[] {
  return portalTsxFiles(APP_ROOT).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    if (!source.includes("PortalDataTableColumn")) return [];
    const file = relative(APP_ROOT, path);
    return columnListsIn(source).map((columns) => ({ file, columns }));
  });
}

/** Columns a phone still has to fit: neither dropped nor an icon button. */
function visibleOnAPhone(columns: Column[]): Column[] {
  return columns.filter((column) => !column.hideBelow && !column.srOnlyLabel);
}

describe("portal table column budget", () => {
  test("the scan finds the tables it is meant to police", () => {
    // Without this the whole file passes vacuously the day the parser stops
    // recognising a column list -- a `satisfies` in place of the annotation
    // would be enough.
    const tables = portalTables();
    expect(tables.length).toBeGreaterThan(40);
    expect(tables.every((table) => table.columns.length > 0)).toBe(true);
  });

  test("no table asks a phone for more than three columns", () => {
    const overBudget = portalTables()
      .filter((table) => !(table.file in EXEMPT))
      .filter((table) => visibleOnAPhone(table.columns).length > COLUMN_BUDGET)
      .map(
        (table) =>
          `${table.file} shows ${visibleOnAPhone(table.columns).length} columns below sm (${visibleOnAPhone(
            table.columns,
          )
            .map((column) => column.key)
            .join(
              ", ",
            )}) -- give the extras hideBelow, or exempt the table with a reason`,
      );

    expect(overBudget).toEqual([]);
  });

  test("every exemption is still earning its place", () => {
    const tables = portalTables();
    const stale = Object.keys(EXEMPT).filter((file) => {
      const matching = tables.filter((table) => table.file === file);
      return (
        matching.length === 0 ||
        matching.every(
          (table) => visibleOnAPhone(table.columns).length <= COLUMN_BUDGET,
        )
      );
    });

    expect(stale).toEqual([]);
  });

  test("a table that hides a column keeps a way back to the value", () => {
    // `PortalDataTable` gives every table that hides a column a row-detail
    // disclosure by default, so the dropped values are one tap away at
    // exactly the width that dropped them. `rowDetail="none"` turns that off,
    // and is only honest where the row already opens the whole record.
    const unreachable: string[] = [];

    for (const path of portalTsxFiles(APP_ROOT)) {
      const source = readFileSync(path, "utf8");
      if (!/rowDetail=\{?"none"/.test(source)) continue;
      const file = relative(APP_ROOT, path);
      const hidesAnything = columnListsIn(source).some((columns) =>
        columns.some((column) => column.hideBelow),
      );
      if (!hidesAnything) continue;
      // A row opener: a link out to a detail route, or a per-row sheet,
      // dialog or modal rendered inside the table.
      const opens =
        /from "next\/link"/.test(source) ||
        /<[A-Z]\w*(Sheet|Dialog|Modal|Drawer)\b/.test(source);
      if (!opens) {
        unreachable.push(
          `${file} hides columns and sets rowDetail="none", but nothing in it opens the row`,
        );
      }
    }

    expect(unreachable).toEqual([]);
  });
});
