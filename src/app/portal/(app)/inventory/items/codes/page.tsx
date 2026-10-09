import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getRequestOrigin } from "@/lib/request-origin";
import { getTenantBranding } from "@/lib/tenant-branding";
import { getInventoryTagSettings, tagUrl } from "@/lib/inventory-tags";
import {
  MAX_LABEL_ITEMS,
  parseLabelOptions,
  parseNumberRange,
} from "@/lib/inventory-labels";
import {
  CODE_FILTER_PARAMS,
  CODE_KINDS,
  CODE_STATES,
  CODES_PATH,
  EMPTY_CODE_FILTERS,
  codeFilterParams,
  codeKindLabel,
  codeQueryArgs,
  codeStateLabel,
  codesHref,
  formatCount,
  hasCodeFilters,
  parseCodeFilters,
  parseTagIds,
  type CodeFilters,
  type CodeQueryArgs,
} from "@/lib/inventory-codes";
import { code128DataUri, qrCodeDataUri } from "@/lib/inventory-label-codes";
import {
  buildHref,
  PAGE_SIZE,
  pageRange,
  parsePage,
  parsePerPage,
  totalPagesFor,
} from "@/lib/pagination";
import { ActiveFilters, type ActiveFilter } from "@/components/active-filters";
import { FilterSubmitButton } from "@/components/filter-submit-button";
import { FiltersSheet } from "@/components/filters-sheet";
import { LinkPendingPulse } from "@/components/link-pending";
import { SearchField } from "@/components/search-field";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { EmptyState } from "@/components/portal/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  LabelSheets,
  labelLogoSrc,
  type PrintableLabel,
} from "../labels/label-sheets";
import { LabelToolbar } from "../labels/label-toolbar";
import {
  GenerateCodesForm,
  NumberedOnlyForm,
  PrefixForm,
  PrintRangeForm,
} from "./code-forms";
import { CodesTable, type CodeRow } from "./codes-table";

export const metadata: Metadata = { title: "Codes" };

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const labelClassName =
  "app-muted text-xs font-semibold uppercase tracking-[0.1em]";

function Title() {
  return (
    <div className="print:hidden">
      <PortalBreadcrumbs current="Codes" />
      <div className="mt-4 w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Codes
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
    </div>
  );
}

function toCodeRow(
  row: NonNullable<Awaited<ReturnType<typeof listCodes>>["data"]>[number],
): CodeRow {
  return {
    id: row.id,
    kind: row.kind,
    codeKind: row.code_kind,
    state: row.state,
    value: row.value,
    number: row.number,
    itemId: row.item_id,
    itemDescription: row.item_description,
    itemSize: row.item_size,
    lastPrintedAt: row.last_printed_at,
    printCount: row.print_count,
    nfcWrittenAt: row.nfc_written_at,
    retiredAt: row.retired_at,
    retiredReason: row.retired_reason,
    retiredNote: row.retired_note,
  };
}

function listCodes(
  supabase: SupabaseServer,
  args: CodeQueryArgs & { p_ids?: string[] },
  limit: number,
  offset = 0,
) {
  return supabase.rpc("inventory_tag_codes", {
    ...args,
    p_limit: limit,
    p_offset: offset,
  });
}

/**
 * Every tag code in one place (#1450): numbered codes (#1444), the random
 * asset tags on items, blanks printed ahead of intake, and NFC serials, in
 * one list filtered and paged in the database -- codes grow without bound.
 * The numbered-code tools (prefix, Create codes, Print range) stay at the
 * top.
 *
 * Under `inventory/items/layout.tsx`, so reading, reprinting and marking a
 * code written to NFC are `inventory:view`; generating, assigning and
 * retiring are `inventory:manage`, offered only to that grant and re-checked
 * by every action.
 *
 * `?print=<tag id>,…` (or `?print=filter` with the list's filters) is the
 * print view for any mix of codes, on the same sheets as every other label;
 * `?numbers=1-50` stays as an alias for a range of numbered codes, so links
 * from before this page still work. Printing is recorded by the print button,
 * not by opening the view.
 */
export default async function CodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const filters = parseCodeFilters(
    Object.fromEntries(CODE_FILTER_PARAMS.map((key) => [key, raw(key)])),
  );

  const supabase = await createSupabaseServerClient();
  const [permissions, { prefix, numberedOnly }] = await Promise.all([
    getCurrentUserPermissions(supabase),
    getInventoryTagSettings(supabase),
  ]);
  const canManage = hasPermission(permissions, "inventory", "manage");

  const printParam = raw("print");
  const range = parseNumberRange(raw("numbers"));
  if (printParam || range) {
    return (
      <PrintView
        supabase={supabase}
        prefix={prefix}
        filters={filters}
        ids={
          printParam && printParam !== "filter" ? parseTagIds(printParam) : null
        }
        range={range}
        options={parseLabelOptions({
          layout: raw("layout"),
          skip: raw("skip"),
          barcode: raw("barcode"),
        })}
      />
    );
  }

  const page = parsePage(raw("page"));
  const perPage = parsePerPage(raw("perPage"));
  const { offset } = pageRange(page, perPage);
  const [listResult, lastResult] = await Promise.all([
    listCodes(supabase, codeQueryArgs(filters, prefix), perPage, offset),
    supabase
      .from("inventory_item_tags")
      .select("number")
      .eq("kind", "numbered")
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (listResult.error) throw new Error("Could not load the codes.");
  const rows = (listResult.data ?? []).map(toCodeRow);
  const total = Number(listResult.data?.[0]?.total_count ?? 0);
  const last = lastResult.data?.number ?? 0;
  const filtered = hasCodeFilters(filters);

  const filterParams = codeFilterParams(filters);
  if (perPage !== PAGE_SIZE) filterParams.set("perPage", String(perPage));
  const pageHref = (next: number) =>
    buildHref(CODES_PATH, filterParams, { page: next });
  const perPageHref = (next: number) =>
    buildHref(CODES_PATH, filterParams, { perPage: next, page: 1 });

  // Every filter but search, carried through a search submission and shown
  // as chips, so a narrowed list says why it is short.
  const preserve: Record<string, string> = Object.fromEntries(
    codeFilterParams({ ...filters, search: "" }),
  );
  const applied: ActiveFilter[] = [];
  if (filters.search) {
    applied.push({ param: "search", label: "Search", value: filters.search });
  }
  if (filters.kind) {
    applied.push({
      param: "kind",
      label: "Kind",
      value: codeKindLabel(filters.kind),
    });
  }
  if (filters.state) {
    applied.push({
      param: "state",
      label: "State",
      value: codeStateLabel(filters.state),
    });
  }
  if (filters.neverPrinted) {
    applied.push({ param: "unprinted", label: "Printed", value: "Never" });
  }
  if (filters.notWritten) {
    applied.push({ param: "unwritten", label: "NFC", value: "Not written" });
  }
  if (filters.from !== null) {
    applied.push({ param: "from", label: "From", value: String(filters.from) });
  }
  if (filters.to !== null) {
    applied.push({ param: "to", label: "To", value: String(filters.to) });
  }
  const activeCount = applied.filter((f) => f.param !== "search").length;

  return (
    <>
      <Title />
      <p className="app-muted mt-4 max-w-3xl">
        Every code your labels and NFC tags carry: numbered codes, the codes on
        items, blank labels printed ahead of intake, and NFC serials. Reprint
        any of them, mark which tags have been written, and retire a code whose
        tag is damaged or lost.
      </p>

      {!prefix ? (
        <Card className="mt-6 max-w-xl">
          <CardHeader>
            <CardTitle>Choose a prefix for numbered codes</CardTitle>
            <CardDescription>
              Every numbered code starts with your organization&rsquo;s three
              letters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canManage ? (
              <PrefixForm current={null} />
            ) : (
              <p className="text-sm">
                Someone who can manage inventory has to choose the prefix before
                numbered codes can be created.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        (canManage || last > 0) && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {canManage && (
              <Card>
                <CardHeader>
                  <CardTitle>Create numbered codes</CardTitle>
                  <CardDescription>
                    {last > 0
                      ? `The next is ${prefix}-${String(last + 1).padStart(3, "0")}.`
                      : `The first is ${prefix}-001.`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GenerateCodesForm />
                </CardContent>
              </Card>
            )}
            {last > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Print a range</CardTitle>
                  <CardDescription>
                    Each label has the code in large type and a QR code of its
                    tag URL.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PrintRangeForm last={last} />
                </CardContent>
              </Card>
            ) : (
              canManage && (
                <Card>
                  <CardHeader>
                    <CardTitle>Prefix</CardTitle>
                    <CardDescription>
                      You can still change it: no codes carry it yet.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PrefixForm current={prefix} />
                  </CardContent>
                </Card>
              )
            )}
          </div>
        )
      )}

      {prefix && canManage && (
        <Card className="mt-6 max-w-xl">
          <CardHeader>
            <CardTitle>At intake</CardTitle>
            <CardDescription>
              Whether an item received with nothing scanned gets a code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NumberedOnlyForm current={numberedOnly} />
          </CardContent>
        </Card>
      )}

      <div className="rainbow-surface mt-6 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--line)] p-4 shadow-md">
        <SearchField
          action={CODES_PATH}
          defaultValue={filters.search}
          placeholder="Code or item..."
          preserve={preserve}
        />
        <FiltersSheet activeCount={activeCount}>
          <form method="get" className="flex flex-col gap-4">
            <input type="hidden" name="search" value={filters.search} />
            <div className="flex flex-col gap-1">
              <label htmlFor="code-kind" className={labelClassName}>
                Kind
              </label>
              <select
                id="code-kind"
                name="kind"
                defaultValue={filters.kind ?? ""}
                className={selectClassName}
              >
                <option value="">All kinds</option>
                {CODE_KINDS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="code-state" className={labelClassName}>
                State
              </label>
              <select
                id="code-state"
                name="state"
                defaultValue={filters.state ?? ""}
                className={selectClassName}
              >
                <option value="">All states</option>
                {CODE_STATES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="code-unprinted"
                name="unprinted"
                value="1"
                defaultChecked={filters.neverPrinted}
              />
              <label htmlFor="code-unprinted" className="text-sm">
                Never printed
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="code-unwritten"
                name="unwritten"
                value="1"
                defaultChecked={filters.notWritten}
              />
              <label htmlFor="code-unwritten" className="text-sm">
                Not written to NFC
              </label>
            </div>
            <fieldset className="flex flex-col gap-1">
              <legend className={labelClassName}>
                Numbered codes from … to
              </legend>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  aria-label="From number"
                  name="from"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  defaultValue={filters.from ?? ""}
                  className="w-24"
                />
                <span aria-hidden>–</span>
                <Input
                  aria-label="To number"
                  name="to"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  defaultValue={filters.to ?? ""}
                  className="w-24"
                />
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSubmitButton />
              {filtered && (
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={<Link href={CODES_PATH} />}
                >
                  <LinkPendingPulse>Clear</LinkPendingPulse>
                </Button>
              )}
            </div>
          </form>
        </FiltersSheet>
      </div>

      <ActiveFilters
        action={CODES_PATH}
        filters={applied}
        params={Object.fromEntries(codeFilterParams(filters))}
      />

      <div className="mt-6">
        <CodesTable
          rows={rows}
          total={total}
          filterQuery={codeFilterParams(filters).toString()}
          filtered={filtered}
          canManage={canManage}
          numberedOnly={numberedOnly}
        />
      </div>

      {rows.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPagesFor(total, perPage)}
          count={total}
          pageSize={perPage}
          hrefFor={pageHref}
          perPageHrefFor={perPageHref}
        />
      )}
    </>
  );
}

/**
 * Labels for any mix of codes. A code on an item prints the item's
 * description and size, as the items label page does; a numbered code prints
 * the code alone, because its label outlives every item it is stuck to
 * (#1444); a blank has no item to name. A retired code is left out: its tag
 * is gone, and printing a copy is what un-retiring it is for.
 */
async function PrintView({
  supabase,
  prefix,
  filters,
  ids,
  range,
  options,
}: {
  supabase: SupabaseServer;
  prefix: string | null;
  filters: CodeFilters;
  ids: string[] | null;
  range: { from: number; to: number } | null;
  options: ReturnType<typeof parseLabelOptions>;
}) {
  const printable: string[] = ["free", "blank", "on_item"];
  const args = ids
    ? { ...codeQueryArgs(EMPTY_CODE_FILTERS, prefix), p_ids: ids }
    : range
      ? codeQueryArgs(
          { ...EMPTY_CODE_FILTERS, from: range.from, to: range.to },
          prefix,
        )
      : codeQueryArgs(filters, prefix);
  const { data, error } = await listCodes(
    supabase,
    {
      ...args,
      p_kinds: (args.p_kinds ?? ["numbered", "asset_tag", "blank"]).filter(
        (kind) => kind !== "nfc",
      ),
      p_states: (args.p_states ?? printable).filter((state) =>
        printable.includes(state),
      ),
    },
    MAX_LABEL_ITEMS,
  );
  if (error) throw new Error("Could not load the codes.");

  const rows = data ?? [];
  const total = Number(rows[0]?.total_count ?? 0);
  const [origin, branding] = await Promise.all([
    getRequestOrigin(),
    getTenantBranding(supabase),
  ]);
  const labels: PrintableLabel[] = rows.map((row) => {
    const named = row.kind === "asset_tag" && row.item_id;
    return {
      itemId: row.item_id ?? row.id,
      tagId: row.id,
      code: row.value,
      description: named ? (row.item_description ?? "") : "",
      size: named ? row.item_size : null,
      qrSrc: qrCodeDataUri(tagUrl(origin, row.value)),
      barcodeSrc: options.barcode ? code128DataUri(row.value) : null,
    };
  });
  const backHref = ids || range ? CODES_PATH : codesHref(filters);

  return (
    <>
      <Title />
      {labels.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="px-0">
            <EmptyState
              title="No labels to print"
              description={
                range
                  ? `There are no numbered codes to print from ${range.from} to ${range.to}.`
                  : "None of these codes can be printed. A retired code has to be restored first, and an NFC serial has no label."
              }
              action={
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={backHref} />}
                >
                  Back to codes
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <LabelToolbar
            layout={options.layout.key}
            skip={options.skip}
            barcode={options.barcode}
            printable
            tagIds={labels.map((label) => label.tagId)}
            backHref={backHref}
            backLabel="Back to codes"
          />
          {total > labels.length && (
            <Alert className="print:hidden">
              <AlertTitle>
                The first {labels.length} of {formatCount(total, "code")}
              </AlertTitle>
              <AlertDescription>
                One print run takes up to {MAX_LABEL_ITEMS} labels. Narrow the
                filters, or print these and then the next range.
              </AlertDescription>
            </Alert>
          )}
          <div className="overflow-x-auto pb-2 print:overflow-visible print:pb-0">
            <LabelSheets
              labels={labels}
              layout={options.layout}
              skip={options.skip}
              logoSrc={labelLogoSrc(branding.logoUrl)}
            />
          </div>
        </div>
      )}
    </>
  );
}
