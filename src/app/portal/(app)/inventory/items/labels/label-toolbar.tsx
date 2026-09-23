"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { runAction } from "@/components/portal/action-toast";
import {
  LABEL_LAYOUTS,
  labelsPerPage,
  type LabelLayoutKey,
} from "@/lib/inventory-labels";
import { createAssetTagsAction } from "../actions";

const LAYOUT_ITEMS = LABEL_LAYOUTS.map((layout) => ({
  value: layout.key,
  label: layout.name,
}));

/**
 * The print options, kept in the URL: a reprint of the same sheet is the same
 * link, and the page redraws on the server with the new geometry.
 */
export function LabelToolbar({
  layout,
  skip,
  barcode,
  printable,
}: {
  layout: LabelLayoutKey;
  skip: number;
  barcode: boolean;
  /** False when there is nothing to print yet, which disables Print. */
  printable: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const current = LABEL_LAYOUTS.find((option) => option.key === layout)!;
  const perPage = labelsPerPage(current);

  function setParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-4 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/portal/inventory/items" />}
        >
          <ArrowLeft /> Back to items
        </Button>
        <Button
          type="button"
          className="ml-auto"
          disabled={!printable || isPending}
          onClick={() => window.print()}
        >
          <Printer /> Print labels
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="label-layout">Paper</Label>
          <Select
            items={LAYOUT_ITEMS}
            value={layout}
            onValueChange={(next) =>
              // A skip counted against one sheet means nothing on another.
              next && next !== layout && setParams({ layout: next, skip: null })
            }
          >
            <SelectTrigger id="label-layout" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LABEL_LAYOUTS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="app-muted text-xs">{current.description}</p>
        </div>

        {perPage > 1 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label-skip">Skip used labels</Label>
            <Input
              id="label-skip"
              type="number"
              inputMode="numeric"
              min={0}
              max={perPage - 1}
              defaultValue={skip}
              key={`${layout}-${skip}`}
              className="w-24"
              onBlur={(event) => {
                const value = event.currentTarget.value;
                if (value !== String(skip)) setParams({ skip: value || null });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <p className="app-muted text-xs">
              Start partway down a part-used sheet.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 pb-5">
          <Checkbox
            id="label-barcode"
            checked={barcode}
            onCheckedChange={(checked) =>
              setParams({ barcode: checked ? "1" : null })
            }
          />
          <Label htmlFor="label-barcode">Add a 1D barcode</Label>
        </div>

        {isPending && <Spinner className="mb-5" />}
      </div>

      <p className="app-muted text-sm">
        In the print dialog, set the scale to 100% (“Actual size”) and the
        margins to None, or the labels will drift off the sheet’s cut lines.
      </p>
    </div>
  );
}

/** Gives the listed items codes, then redraws the page with their labels. */
export function CreateCodesButton({ itemIds }: { itemIds: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await runAction(() => createAssetTagsAction(itemIds), {
            success: (result) =>
              `${result.created} code${result.created === 1 ? "" : "s"} created.`,
            onSuccess: () => router.refresh(),
          });
        })
      }
    >
      {isPending && <Spinner />} Create {itemIds.length} code
      {itemIds.length === 1 ? "" : "s"}
    </Button>
  );
}
