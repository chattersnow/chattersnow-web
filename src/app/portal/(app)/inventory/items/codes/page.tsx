import type { Metadata } from "next";
import Link from "next/link";
import { Printer } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCurrentUserPermissions,
  hasPermission,
} from "@/lib/auth/permissions";
import { getRequestOrigin } from "@/lib/request-origin";
import { getInventoryTagPrefix, tagUrl } from "@/lib/inventory-tags";
import {
  NUMBERED_CODES_PATH,
  numberedCodesHref,
  parseLabelOptions,
  parseNumberRange,
} from "@/lib/inventory-labels";
import { code128DataUri, qrCodeDataUri } from "@/lib/inventory-label-codes";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { EmptyState } from "@/components/portal/empty-state";
import { IconLink } from "@/components/portal/icon-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { itemHref } from "../inventory-shared";
import { LabelSheets, type PrintableLabel } from "../labels/label-sheets";
import { LabelToolbar } from "../labels/label-toolbar";
import { GenerateCodesForm, PrefixForm, PrintRangeForm } from "./code-forms";
import { CopyTagUrlButton } from "./copy-tag-url-button";

export const metadata: Metadata = { title: "Numbered codes" };

type CodeRow = {
  id: string;
  number: number;
  value: string;
  item: { id: string; description: string; size: string | null } | null;
};

function Title() {
  return (
    <div className="print:hidden">
      <PortalBreadcrumbs current="Numbered codes" />
      <div className="mt-4 w-fit">
        <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
          Numbered codes
        </h1>
        <div className="rainbow-accent mt-3 w-full" />
      </div>
    </div>
  );
}

/**
 * Reusable numbered codes (#1444): a pool of labels and NFC tags printed and
 * written once, then moved from item to item. A code is freed by itself when
 * its item is distributed, retired or lost, so the same tag goes on the next
 * piece without being rewritten.
 *
 * Under `inventory/items/layout.tsx`, so reading is `inventory:view`, and
 * every write here -- the prefix, new codes -- is `inventory:manage`.
 * `?numbers=1-50` is the print view of a range, laid out by the same sheets as
 * every other label.
 */
export default async function NumberedCodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const range = parseNumberRange(raw("numbers"));

  const supabase = await createSupabaseServerClient();
  const [permissions, prefix, { data, error }] = await Promise.all([
    getCurrentUserPermissions(supabase),
    getInventoryTagPrefix(supabase),
    supabase
      .from("inventory_item_tags")
      .select(
        "id, number, value, item:inventory_items!inventory_item_tags_item_in_tenant(id, description, size)",
      )
      .eq("kind", "numbered")
      .order("number")
      .overrideTypes<CodeRow[], { merge: false }>(),
  ]);
  if (error) throw new Error("Could not load the numbered codes.");
  const canManage = hasPermission(permissions, "inventory", "manage");
  const codes = data ?? [];

  if (range) {
    const options = parseLabelOptions({
      layout: raw("layout"),
      skip: raw("skip"),
      barcode: raw("barcode"),
    });
    const origin = await getRequestOrigin();
    // The slot, not the item on it: a numbered label outlives every item it
    // is stuck to, so it carries the code alone.
    const labels: PrintableLabel[] = codes
      .filter((code) => code.number >= range.from && code.number <= range.to)
      .map((code) => ({
        itemId: code.id,
        code: code.value,
        description: "",
        size: null,
        qrSrc: qrCodeDataUri(tagUrl(origin, code.value)),
        barcodeSrc: options.barcode ? code128DataUri(code.value) : null,
      }));

    return (
      <>
        <Title />
        {labels.length === 0 ? (
          <Card className="mt-6">
            <CardContent className="px-0">
              <EmptyState
                title="No codes in that range"
                description={`There are no numbered codes from ${range.from} to ${range.to}.`}
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
              backHref={NUMBERED_CODES_PATH}
              backLabel="Back to numbered codes"
            />
            <div className="overflow-x-auto pb-2 print:overflow-visible print:pb-0">
              <LabelSheets
                labels={labels}
                layout={options.layout}
                skip={options.skip}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  const free = codes.filter((code) => !code.item).length;
  const last = codes.at(-1)?.number ?? 0;

  return (
    <>
      <Title />
      <p className="app-muted mt-4 max-w-3xl">
        Print these once, stick them on gear or write them to NFC tags, and
        reuse them. A code points at whichever item holds it now, and it comes
        free by itself when that item is distributed, retired or lost.
      </p>

      {!prefix ? (
        <Card className="mt-6 max-w-xl">
          <CardHeader>
            <CardTitle>Choose a prefix</CardTitle>
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
                codes can be created.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {canManage && (
              <Card>
                <CardHeader>
                  <CardTitle>Create codes</CardTitle>
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
            {codes.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Print labels</CardTitle>
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

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Codes</CardTitle>
              <CardDescription>
                {codes.length === 0
                  ? "None yet."
                  : `${codes.length} ${codes.length === 1 ? "code" : "codes"}, ${free} free.`}
              </CardDescription>
            </CardHeader>
            {codes.length > 0 && (
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Code</TableHead>
                      <TableHead>On</TableHead>
                      <TableHead className="pr-6 text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {codes.map((code) => (
                      <TableRow key={code.id}>
                        <TableCell className="pl-6 font-mono font-semibold tracking-wider">
                          {code.value}
                        </TableCell>
                        <TableCell>
                          {code.item ? (
                            <Link
                              href={itemHref(code.item.id)}
                              className="underline-offset-2 hover:underline"
                            >
                              {code.item.size
                                ? `${code.item.description} (${code.item.size})`
                                : code.item.description}
                            </Link>
                          ) : (
                            <Badge variant="secondary">Free</Badge>
                          )}
                        </TableCell>
                        <TableCell className="pr-6">
                          <div className="flex justify-end gap-1">
                            <CopyTagUrlButton code={code.value} />
                            <IconLink
                              href={numberedCodesHref({
                                from: code.number,
                                to: code.number,
                              })}
                              label={`Print label for ${code.value}`}
                            >
                              <Printer />
                            </IconLink>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </>
  );
}
