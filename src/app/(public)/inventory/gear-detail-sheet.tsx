"use client";

import { categoryLabelFor } from "@/lib/inventory";
import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import { BrandImageFallback } from "@/components/brand-image-fallback";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
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
  cartCount,
  onViewCart,
  placeholderUrl,
}: {
  item: GearItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inCart: boolean;
  onToggleCart: () => void;
  /** How many items are in the cart, so the sheet can offer its own way out. */
  cartCount: number;
  onViewCart: () => void;
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
            </div>

            {/*
              The cart tray sits at z-40, under the sheet's own backdrop, so
              while this sheet is open the only feedback an add gives is the
              button's own label and there is no way through to checkout
              without closing the sheet first. The footer carries both: the
              running count, and the way out.
            */}
            <SheetFooter className="flex-wrap justify-between">
              <Button
                type="button"
                variant={inCart ? "secondary" : "outline"}
                className="flex-1 sm:flex-none"
                onClick={onToggleCart}
              >
                {inCart ? "Remove from cart" : "Add to cart"}
              </Button>
              {cartCount > 0 && (
                <Button
                  type="button"
                  className="flex-1 sm:flex-none"
                  onClick={onViewCart}
                >
                  <ShoppingCart aria-hidden />
                  View cart
                  <Badge variant="secondary">{cartCount}</Badge>
                </Button>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
