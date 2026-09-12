"use client";

import { categoryLabelFor } from "@/lib/inventory";
import Image from "next/image";
import { BrandImageFallback } from "@/components/brand-image-fallback";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  CONDITIONS,
  GENDERS,
  labelFor,
  resolveImageUrl,
} from "@/lib/inventory";
import type { GearItem } from "./gear-catalog";
import { formatInstantDate } from "@/lib/format";

export function GearDetailSheet({
  item,
  open,
  onOpenChange,
  inCart,
  onToggleCart,
  placeholderUrl,
}: {
  item: GearItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inCart: boolean;
  onToggleCart: () => void;
  placeholderUrl: string | null;
}) {
  const genderLabel = item ? labelFor(GENDERS, item.gender) : null;
  const imageUrl = item
    ? (resolveImageUrl(item.photo_url) ?? placeholderUrl)
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        {item && (
          <>
            <SheetHeader>
              <p className="app-eyebrow">{categoryLabelFor(item)}</p>
              <SheetTitle className="text-xl">{item.description}</SheetTitle>
              <SheetDescription>
                {[item.size, genderLabel, labelFor(CONDITIONS, item.condition)]
                  .filter(Boolean)
                  .join(" · ")}
                {" · "}
                Available since {formatInstantDate(item.created_at)}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={item.description}
                    fill
                    sizes="(min-width: 640px) 28rem, 100vw"
                    className="object-cover"
                  />
                ) : (
                  <BrandImageFallback label="Photo coming soon" />
                )}
              </div>

              <Button
                type="button"
                variant={inCart ? "secondary" : "outline"}
                className="mt-4 w-full sm:w-fit"
                onClick={onToggleCart}
              >
                {inCart ? "Remove from cart" : "Add to cart"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
