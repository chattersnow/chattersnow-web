import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/request-origin";
import { tagUrl } from "@/lib/inventory-tags";
import { parseLabelCodes, parseLabelOptions } from "@/lib/inventory-labels";
import { code128DataUri, qrCodeDataUri } from "@/lib/inventory-label-codes";
import { PortalBreadcrumbs } from "@/components/portal/breadcrumbs";
import { EmptyState } from "@/components/portal/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LabelSheets,
  type PrintableLabel,
} from "../../items/labels/label-sheets";
import { LabelToolbar } from "../../items/labels/label-toolbar";
import { BlankLabelsForm } from "./blank-labels-form";

export const metadata: Metadata = { title: "Print labels · Donations" };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Labels for intake (#1420 part 4): the items one donation brought in
 * (`?donation=<id>`, linked from the donation sheet's confirmation), or a
 * batch of blank codes printed ahead of an intake day (`?codes=<code>,…`).
 * With neither, it offers to make that batch.
 *
 * Under Inventory -> Donations rather than Items, because its main reader is
 * the intake volunteer, who holds inventory_intake:manage and cannot open the
 * items list. The layout gates it as Donations; the rows come through
 * inventory_intake_labels(), which returns only what goes on the label.
 */
export default async function IntakeLabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const options = parseLabelOptions({
    layout: raw("layout"),
    skip: raw("skip"),
    barcode: raw("barcode"),
  });
  const donationId = UUID_PATTERN.test(raw("donation") ?? "")
    ? raw("donation")!
    : null;
  const codes = parseLabelCodes(raw("codes"));
  const hasSource = donationId !== null || codes.length > 0;
  const title = donationId ? "Print labels" : "Blank labels";

  const supabase = await createSupabaseServerClient();
  const [origin, rowsResult] = await Promise.all([
    getRequestOrigin(),
    hasSource
      ? supabase.rpc("inventory_intake_labels", {
          p_donation_id: donationId as string,
          p_codes: codes.length > 0 ? codes : (null as unknown as string[]),
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (rowsResult.error) throw new Error("Could not load the labels.");

  const labels: PrintableLabel[] = (rowsResult.data ?? []).map((row) => ({
    itemId: row.item_id ?? row.tag_id,
    code: row.code,
    description: row.description ?? "",
    size: row.size,
    qrSrc: qrCodeDataUri(tagUrl(origin, row.code)),
    barcodeSrc: options.barcode ? code128DataUri(row.code) : null,
  }));

  return (
    <>
      <div className="print:hidden">
        <PortalBreadcrumbs current={title} />
        <div className="mt-4 w-fit">
          <h1 className="brand-display text-4xl font-semibold tracking-brand sm:text-5xl">
            {title}
          </h1>
          <div className="rainbow-accent mt-3 w-full" />
        </div>
      </div>

      {!hasSource ? (
        <Card className="mt-6 max-w-xl">
          <CardHeader>
            <CardTitle>Blank labels for intake</CardTitle>
            <CardDescription>
              Print labels before the gear arrives, then stick one on each item
              as it is received.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BlankLabelsForm />
          </CardContent>
        </Card>
      ) : labels.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="px-0">
            <EmptyState
              title="No labels to print"
              description={
                codes.length > 0
                  ? "These labels have all been used on items since they were printed."
                  : "This donation has no items with codes."
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
            backHref="/portal/inventory/donations"
            backLabel="Back to donations"
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
