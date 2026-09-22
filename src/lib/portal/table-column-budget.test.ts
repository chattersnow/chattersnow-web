// Every portal table has to survive a 390px phone (#1090).
//
// `hideBelow` on a column is what carries a wide table onto a phone, and it
// works -- Expenses drops from nine columns to Description / Amount / Status
// and reads cleanly. The problem was never the capability, it was adoption:
// thirteen of the portal's seventy-odd tables set it, and everything else fell
// back to a silent `overflow-x-auto`. Twenty tables fixed by hand is worth
// less than the rule that catches the twenty-first, which is what this is.
//
// It reads two spellings of a table, because the portal has two (#1116): a
// `PortalDataTableColumn[]` literal, and hand-rolled `<TableHead>` markup --
// the fixed-order aggregates and grouped subtotal tables the PortalDataTable
// migration deliberately left server-rendered (#506). A rule that saw only the
// first would have left the larger half unguarded, which is where a table
// nobody has looked at is most likely to be.
//
// Like nav-guards.test.ts and module-catalog.test.ts, it reads the source on
// disk rather than a constant: column lists are spread over forty-odd
// components and nothing imports them anywhere they could be counted.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const SRC_ROOT = join(import.meta.dir, "../..");
const APP_ROOT = join(SRC_ROOT, "app/portal/(app)");

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
  "finance/donations/import/donation-import-panel.tsx":
    "The preview of the gifts about to be imported, and the reader is " +
    "reconciling it against a bank statement. The received amount only " +
    "means anything beside the gross and the fee it came out of, and the " +
    "transaction ID is the column that says which line of the export a row " +
    "is.",
  "inventory/reports/page.tsx":
    "A grouped aggregate: the subtotal rows span Group and Category with " +
    "colSpan, so dropping either leaves the spans describing columns that " +
    "are no longer there, and a count without the value it totals is not a " +
    "report.",
  "finance/sales/sale-details-sheet.tsx":
    "A sale line is arithmetic -- quantity times price is the total, and an " +
    "overridden price is shown struck through beside the one charged. " +
    "Dropping any of the three leaves a sum the reader cannot check.",
  "administration/data-retention/retention-runs-table.tsx":
    "The table is the record: nothing opens a run, so a hidden column has " +
    "nowhere to reappear, and a run you can see succeeded but whose row " +
    "counts you cannot read is not an audit trail.",
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

// ---------------------------------------------------------------------------
// Hand-rolled `<TableHead>` markup (#1116)
//
// What makes JSX tractable here is that a server-rendered portal table spells
// its columns one of exactly two ways: a literal `<TableHead>` per column, or
// a `.map` over a local `{ key, label, hideBelow? }[]` constant that is a
// column list in all but name. Both are read below. A `.map` whose constant
// cannot be found is reported rather than counted as zero -- an unparsed table
// that passes is the failure mode this whole file exists to avoid.

/** The end of the JSX opening tag starting at `start`, and whether it closed. */
function openingTag(
  masked: string,
  start: number,
): { end: number; selfClosing: boolean } | null {
  let depth = 0;
  for (let i = start; i < masked.length; i++) {
    const char = masked[i];
    if (char === "{") depth++;
    else if (char === "}") depth--;
    // An arrow in an attribute value is always inside braces, so a `>` at
    // brace depth zero can only be the end of the tag.
    else if (char === ">" && depth === 0) {
      return { end: i + 1, selfClosing: masked[i - 1] === "/" };
    }
  }
  return null;
}

/** The constant a `.map(` at `dot` iterates, through any chained call. */
function mapReceiver(masked: string, dot: number): string | null {
  let i = dot - 1;
  for (;;) {
    while (i >= 0 && /\s/.test(masked[i])) i--;
    // Step back over an intervening call's arguments, as in
    // `COLUMNS.filter((column) => column.key !== "name").map(`.
    if (masked[i] !== ")") break;
    const open = matchBracketBackwards(masked, i);
    if (open === -1) return null;
    i = open - 1;
  }
  let end = i + 1;
  while (i >= 0 && /[\w$]/.test(masked[i])) i--;
  if (end === i + 1) return null;
  // Walk to the head of an `A.b.c` chain: the constant is what it starts from.
  while (masked[i] === ".") {
    i--;
    end = i + 1;
    while (i >= 0 && /[\w$]/.test(masked[i])) i--;
  }
  const name = masked.slice(i + 1, end);
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : null;
}

/** Index of the `(` matching the `)` at `start`. */
function matchBracketBackwards(masked: string, start: number): number {
  let depth = 0;
  for (let i = start; i >= 0; i--) {
    if (masked[i] === ")") depth++;
    else if (masked[i] === "(") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Every `[{ key: ... }]` array constant in one file, by the name it binds. */
function columnConstantsIn(
  source: string,
  masked: string,
): Map<string, Column[]> {
  const constants = new Map<string, Column[]>();
  // The type annotation is lazy up to the first `=`, which is the assignment:
  // `{ key: SortColumn; label: string; hideBelow?: HideBelow }[]` holds none.
  const declaration =
    /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*?)?=\s*\[/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(masked))) {
    const open = match.index + match[0].length - 1;
    const close = matchBracket(masked, open, "[", "]");
    if (close === -1) continue;
    const columns = columnsInArray(source, masked, open, close);
    if (columns.length > 0) constants.set(match[1], columns);
    declaration.lastIndex = close;
  }
  return constants;
}

/** The file a module specifier resolves to, or null. */
function resolveModule(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(SRC_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? join(dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const constantCache = new Map<string, Map<string, Column[]>>();

/** Column constants a file can name: its own, plus the ones it imports. */
function columnConstantsFor(path: string): Map<string, Column[]> {
  const cached = constantCache.get(path);
  if (cached) return cached;
  // Seeded before recursing so a cycle between two modules terminates.
  const constants = new Map<string, Column[]>();
  constantCache.set(path, constants);
  const source = readFileSync(path, "utf8");
  for (const [name, columns] of columnConstantsIn(
    source,
    blankLiterals(source),
  )) {
    constants.set(name, columns);
  }
  // Read off the raw source: `blankLiterals` blanks the specifier too.
  const imports = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = imports.exec(source))) {
    const names = match[1]
      .split(",")
      .map(
        (name) =>
          name
            .trim()
            .split(/\s+as\s+/)
            .pop()
            ?.trim() ?? "",
      )
      .filter((name) => /^[A-Z][\w$]*$/.test(name));
    if (names.length === 0) continue;
    const imported = resolveModule(path, match[2]);
    if (!imported) continue;
    const exported = columnConstantsFor(imported);
    for (const name of names) {
      const columns = exported.get(name);
      if (columns && !constants.has(name)) constants.set(name, columns);
    }
  }
  return constants;
}

/** How the failure message names a hand-rolled column. */
function labelOf(body: string, position: number): string {
  const labelled = /\blabel=["']([^"']+)["']/.exec(body)?.[1];
  if (labelled) return labelled;
  const text = body
    .replace(/<[^>]*>/g, " ")
    .replace(/\{[^{}]*\}/g, " ")
    .trim();
  return text || `column ${position}`;
}

/**
 * Whether a header cell carries no column label of its own.
 *
 * The array rule spells this `srOnlyLabel: true` and exempts it from the
 * budget; in markup it is an actions column (`<TableHead className="w-0">`
 * around an `sr-only` span, or nothing at all) or a selection checkbox that
 * labels itself with `aria-label`. Neither is a column the reader reads.
 */
function isUnlabelled(body: string): boolean {
  const text = body
    .replace(/\{\s*\/\*[^]*?\*\/\s*\}/g, " ")
    .replace(/<span className="sr-only">[^]*?<\/span>/g, " ")
    .trim();
  return text === "" || /^<Checkbox\b/.test(text);
}

type MarkupTable = { columns: Column[]; unresolved: string[] };

/** One `<TableHeader>…</TableHeader>` block, as the columns it renders. */
function headsIn(
  path: string,
  source: string,
  masked: string,
  start: number,
  end: number,
): MarkupTable {
  // The stretches of the block a `.map` repeats: one literal `<TableHead>`
  // inside one of these stands for every column of the constant it maps.
  const regions: { start: number; end: number; name: string | null }[] = [];
  const mapCall = /\.\s*map\s*\(/g;
  mapCall.lastIndex = start;
  let call: RegExpExecArray | null;
  while ((call = mapCall.exec(masked)) && call.index < end) {
    const open = masked.indexOf("(", call.index);
    const close = matchBracket(masked, open, "(", ")");
    if (close === -1 || close > end) continue;
    if (!masked.slice(open, close).includes("<TableHead")) continue;
    regions.push({
      start: open,
      end: close,
      name: mapReceiver(masked, call.index),
    });
  }

  const columns: Column[] = [];
  const unresolved: string[] = [];
  const expanded = new Set<number>();
  const head = /<TableHead[\s/>]/g;
  head.lastIndex = start;
  let match: RegExpExecArray | null;
  while ((match = head.exec(masked)) && match.index < end) {
    const tag = openingTag(masked, match.index);
    if (!tag) continue;
    const attributes = source.slice(match.index, tag.end);
    const body = tag.selfClosing
      ? ""
      : source.slice(tag.end, source.indexOf("</TableHead>", tag.end));
    const cell: Column = {
      key: labelOf(body, columns.length + 1),
      hideBelow:
        /\bhideBelow=(?:["']|\{\s*["'])(\w+)/.exec(attributes)?.[1] ?? null,
      srOnlyLabel: isUnlabelled(body),
    };

    const region = regions.findIndex(
      (candidate) =>
        match!.index > candidate.start && match!.index < candidate.end,
    );
    if (region === -1) {
      columns.push(cell);
      continue;
    }
    if (expanded.has(region)) continue;
    expanded.add(region);
    const constant = regions[region].name
      ? columnConstantsFor(path).get(regions[region].name!)
      : undefined;
    if (!constant) {
      unresolved.push(regions[region].name ?? "an unnamed expression");
      continue;
    }
    // `hideBelow={column.hideBelow}` defers to the constant; a literal
    // `hideBelow="sm"` applies to every column the map produces; and no
    // attribute at all means none of them hide, whatever the constant says.
    const deferred =
      cell.hideBelow === null && /\bhideBelow=\{/.test(attributes);
    for (const column of constant) {
      columns.push({
        key: column.key,
        hideBelow: deferred ? column.hideBelow : cell.hideBelow,
        srOnlyLabel: cell.srOnlyLabel,
      });
    }
  }
  return { columns, unresolved };
}

/** Every hand-rolled table in one file. */
function markupTablesIn(path: string, source: string): MarkupTable[] {
  const masked = blankLiterals(source);
  const tables: MarkupTable[] = [];
  const header = /<TableHeader[\s/>]/g;
  let match: RegExpExecArray | null;
  while ((match = header.exec(masked))) {
    const end = masked.indexOf("</TableHeader>", match.index);
    if (end === -1) continue;
    tables.push(headsIn(path, source, masked, match.index, end));
    header.lastIndex = end;
  }
  return tables;
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

type Table = {
  file: string;
  columns: Column[];
  markup: boolean;
  unresolved: string[];
};

/** Every portal table, by the path the exemption list spells it with. */
function portalTables(): Table[] {
  return portalTsxFiles(APP_ROOT).flatMap((path) => {
    const source = readFileSync(path, "utf8");
    const file = relative(APP_ROOT, path);
    const tables: Table[] = [];
    if (source.includes("PortalDataTableColumn")) {
      for (const columns of columnListsIn(source)) {
        tables.push({ file, columns, markup: false, unresolved: [] });
      }
    }
    if (source.includes("<TableHeader")) {
      for (const table of markupTablesIn(path, source)) {
        tables.push({ file, markup: true, ...table });
      }
    }
    return tables;
  });
}

/**
 * Whether anything in a file opens a row onto the record behind it.
 *
 * Three shapes count: a link out to a detail route, a per-row sheet, dialog
 * or modal, and a form that replaces the row in place -- how the sponsors and
 * shifts tables edit, where the full-width `colSpan` cell holds the editor and
 * every field with it. Each of them brings a dropped column's value back.
 */
function opensTheRow(source: string): boolean {
  return (
    /from "next\/link"/.test(source) ||
    /<[A-Z]\w*(Sheet|Dialog|Modal|Drawer)\b/.test(source) ||
    /colSpan=\{\d+\}[^]*?<[A-Z]\w*Form\b/.test(source)
  );
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
    expect(tables.filter((table) => !table.markup).length).toBeGreaterThan(40);
    expect(tables.filter((table) => table.markup).length).toBeGreaterThan(20);
    expect(tables.every((table) => table.columns.length > 0)).toBe(true);
  });

  test("every mapped column list resolves to a constant it can count", () => {
    // A `.map` the parser can't follow would otherwise contribute nothing and
    // let a nine-column table read as two. Rewriting the map over a local
    // `{ key, label }[]` constant is the fix; so is spelling the columns out.
    const unreadable = portalTables()
      .filter((table) => table.unresolved.length > 0)
      .map(
        (table) =>
          `${table.file} maps ${table.unresolved.join(", ")} into <TableHead> and the column budget cannot count it -- map a local { key, label } constant, or write the columns out`,
      );

    expect(unreadable).toEqual([]);
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
    //
    // Hand-rolled markup has no disclosure to turn off, because `rowDetail`
    // is derived inside `PortalDataTable` -- so a raw `hideBelow` has to
    // answer the same question with a row opener of its own, and where there
    // is none the honest answer is an `EXEMPT` entry rather than a column
    // dropped into nowhere.
    const unreachable: string[] = [];

    for (const path of portalTsxFiles(APP_ROOT)) {
      const source = readFileSync(path, "utf8");
      const file = relative(APP_ROOT, path);
      const hidesWithoutDisclosure =
        (/rowDetail=\{?"none"/.test(source) &&
          columnListsIn(source).some((columns) =>
            columns.some((column) => column.hideBelow),
          )) ||
        (source.includes("<TableHeader") &&
          markupTablesIn(path, source).some((table) =>
            table.columns.some((column) => column.hideBelow),
          ));
      if (!hidesWithoutDisclosure) continue;
      // A skeleton mirrors the table it stands in for, down to the dropped
      // columns -- and holds no values, so there is nothing to get back to.
      if (source.includes("<Skeleton")) continue;
      if (!opensTheRow(source)) {
        unreachable.push(
          `${file} hides columns with no row-detail disclosure, and nothing in it opens the row`,
        );
      }
    }

    expect(unreachable).toEqual([]);
  });
});
