"use client";

import { categoryLabelFor } from "@/lib/inventory";
import Image from "next/image";
import { X } from "lucide-react";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { resolveImageUrl } from "@/lib/inventory";
import { RecordAccountOffer } from "@/components/record-account-offer";
import { GearCartCheckoutForm } from "./gear-cart-checkout-form";
import type { GearItem, SubmittedRequest } from "./gear-catalog";
import type {
  DeliveryMethod,
  PublicGearRequestOptions,
} from "@/lib/gear-requests";
import type { Lexicon } from "@/lib/lexicon";
import type { AccountOffer } from "@/lib/constituent/account-offer";
import type { ViewerContactPrefill } from "@/lib/constituent/viewer";

export function GearCartSheet({
  items,
  open,
  onOpenChange,
  onRemove,
  success,
  onSubmitted,
  placeholderUrl,
  requestOptions,
  prefill,
  accountOffer = null,
  lexicon,
  termsInForce = false,
}: {
  items: GearItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: (itemId: string) => void;
  /** The request just submitted, once one has been. */
  success: SubmittedRequest | null;
  onSubmitted: (deliveryMethod: DeliveryMethod, requestId: string) => void;
  placeholderUrl: string | null;
  requestOptions: PublicGearRequestOptions;
  /** What the signed-in reader's session already knows about them (#1357). */
  prefill?: ViewerContactPrefill;
  /** Whether the receipt offers this reader an account, and which (#1359). */
  accountOffer?: AccountOffer | null;
  /** This organization's words (#896), for the checkout form's copy. */
  lexicon: Lexicon;
  /** Whether this tenant serves `/terms` (#859), for the as-is notice (#1367). */
  termsInForce?: boolean;
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
            <>
              <Alert>
                <div className="rainbow-accent mb-2 w-10" />
                <AlertDescription>
                  Request received! These items are now on hold for you and no
                  longer available to others.{" "}
                  {success.deliveryMethod === "shipping"
                    ? "We'll weigh the package and email you the postage amount and where to send it."
                    : "We'll be in touch to arrange a time and place to hand them over."}
                </AlertDescription>
              </Alert>

              {/* The post-request slot (#1359), and never a gate: the items
                  are already held, the confirmation email is already on its
                  way, and skipping is one click that changes nothing. */}
              {accountOffer && (
                <div className="mt-6">
                  <RecordAccountOffer
                    offer={accountOffer}
                    record={{ kind: "gear-request", id: success.requestId }}
                  />
                </div>
              )}
            </>
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
                          <BrandImageFallback />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.description}
                        </p>
                        <p className="app-muted text-xs">
                          {categoryLabelFor(item)}
                        </p>
                      </div>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remove from cart"
                              onClick={() => onRemove(item.id)}
                            />
                          }
                        >
                          <X className="size-4" />
                        </TooltipTrigger>
                        <TooltipContent>Remove from cart</TooltipContent>
                      </Tooltip>
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
                  options={requestOptions}
                  onSuccess={onSubmitted}
                  prefill={prefill}
                  lexicon={lexicon}
                  termsInForce={termsInForce}
                />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
