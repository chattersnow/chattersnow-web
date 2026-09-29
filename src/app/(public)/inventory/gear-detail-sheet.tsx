"use client";

import { useState } from "react";
import { categoryLabelFor } from "@/lib/inventory";
import Image from "next/image";
import { Check, Share2, ShoppingCart } from "lucide-react";
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
import { GEAR_ITEM_PARAM } from "./gear-item-path";
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
  /**
   * The item to show. Null while open means the link named an item the
   * catalog does not hold -- most often one that has since been requested,
   * which drops it out of `public_gear_catalog`.
   */
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
              <ShareItemButton item={item} />
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
        {!item && (
          <SheetHeader>
            <SheetTitle className="text-xl">
              This item is no longer available
            </SheetTitle>
            <SheetDescription>
              Someone may have requested it already. Close this to browse
              everything that is available now.
            </SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Shares the item's link: the device's share sheet where there is one (every
 * phone), the clipboard where there is not.
 *
 * The link is built from the browser's own origin and path rather than from
 * NEXT_PUBLIC_SITE_URL, so a tenant on its own domain shares that domain
 * (#860). It carries only the item, not whatever filters the sharer had on.
 * The public site mounts no Toaster, so the button's own label says it worked.
 */
function ShareItemButton({ item }: { item: GearItem }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}?${GEAR_ITEM_PARAM}=${item.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: item.description, url });
      } catch {
        // Dismissing the share sheet rejects too (AbortError); either way
        // there is nothing to report, and the address bar holds the link.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      // Refused in some browsers and on every insecure origin. The address
      // bar already holds the same link, so this is a convenience failing.
      setStatus("failed");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="flex-1 sm:flex-none"
        onClick={share}
      >
        {status === "copied" ? <Check aria-hidden /> : <Share2 aria-hidden />}
        {status === "copied"
          ? "Link copied"
          : status === "failed"
            ? "Copy the address bar"
            : "Share"}
      </Button>
      <span role="status" className="sr-only">
        {status === "copied" ? "Link copied" : ""}
      </span>
    </>
  );
}
