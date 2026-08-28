"use client";

import Image from "next/image";
import { ImageOff, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { resolveImageUrl } from "@/lib/inventory";
import { GearCartCheckoutForm } from "./gear-cart-checkout-form";
import type { GearItem } from "./gear-catalog";

export function GearCartSheet({
  items,
  open,
  onOpenChange,
  onRemove,
  success,
  onSubmitted,
  placeholderUrl,
}: {
  items: GearItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: (itemId: string) => void;
  success: boolean;
  onSubmitted: () => void;
  placeholderUrl: string | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Your cart</SheetTitle>
          <SheetDescription>
            Review your selected items, then submit one request for all of them.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {success ? (
            <Alert>
              <AlertDescription>
                Request received! These items are now on hold for you and no
                longer available to others. We&apos;ll be in touch to arrange
                pickup.
              </AlertDescription>
            </Alert>
          ) : items.length === 0 ? (
            <p className="app-muted py-8 text-center text-sm">
              Your cart is empty. Add items from the catalog to get started.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {items.map((item) => {
                  const imageUrl =
                    resolveImageUrl(item.photo_url) ?? placeholderUrl;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-2"
                    >
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                        {imageUrl ? (
                          <Image
                            src={imageUrl}
                            alt={item.description}
                            fill
                            sizes="3rem"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageOff
                              className="size-4 text-muted-foreground"
                              aria-hidden
                            />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.description}
                        </p>
                        <p className="app-muted text-xs">{item.type}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRemove(item.id)}
                      >
                        <X className="size-4" />
                        <span className="sr-only">Remove from cart</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>

              <h3 className="brand-display mt-6 text-lg font-semibold tracking-[-0.02em]">
                Your info
              </h3>
              <div className="mt-4">
                <GearCartCheckoutForm
                  itemIds={items.map((item) => item.id)}
                  onSuccess={onSubmitted}
                />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
